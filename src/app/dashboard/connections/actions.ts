"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AUTH_MESSAGES } from "@/lib/auth/error-messages";
import { CALENDAR_MESSAGES } from "@/lib/calendar/error-messages";
import { getProfileTimeZone, requireActionUser } from "@/lib/calendar/queries";
import { calendarSchema } from "@/lib/calendar/schemas";
import {
  fieldErrorsFromZod,
  readString,
  type ConfirmState,
  type FormState,
} from "@/lib/forms/form-state";
import {
  revokeConnection,
  syncConnection,
  writeEngineDeps,
  type ConnectionSync,
} from "@/lib/sync/engine";
import { createSyncedCalendar } from "@/lib/sync/write-calendar";
import { writeErrorText } from "@/lib/sync/write-errors";
import { nearestColor } from "@/lib/sync/nearest-color";
import { connectionIdSchema, selectionSchema } from "@/lib/sync/schemas";
import { summaryText, SYNC_ERRORS } from "@/lib/sync/summary";

// Actions of /dashboard/connections/[id] (spec 007; plan D5; RF-10, RF-11,
// RF-14, RF-23, RF-24). Ownership is checked with the user's session (RLS)
// before the engine runs with the server secret.

export interface SyncState {
  message?: string;
  formError?: string;
  fieldErrors?: { decision?: string };
}

const GONE = "Esta cuenta ya no existe o no es tuya.";
const LIMIT = "Puedes traer como máximo 20 calendarios por cuenta.";

type User = Awaited<ReturnType<typeof requireActionUser>>;

/** The provider of the user's own connection, or null if it is not theirs (RLS). */
async function ownsConnection({ supabase }: User, id: string) {
  const { data } = await supabase
    .from("calendar_connections")
    .select("id, provider")
    .eq("id", id)
    .maybeSingle();
  return data ? (data.provider ?? "google") : null;
}

/** Text of a finished update: totals and how many calendars failed (RF-23). */
function resultText(sync: ConnectionSync): SyncState {
  if (sync.status === "needs_reauth") return { formError: SYNC_ERRORS.revoked };
  if (sync.status === "too_soon") {
    const minutes = Math.max(
      1,
      Math.ceil((Date.parse(sync.nextAt) - Date.now()) / 60_000),
    );
    return {
      message: `Se ha actualizado hace poco. Podrás volver a actualizar dentro de ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`,
    };
  }

  const total = { added: 0, changed: 0, removed: 0, skipped: 0, omitted: 0 };
  let failed = 0;
  for (const result of sync.results) {
    if ("error" in result) {
      failed++;
      continue;
    }
    for (const key of Object.keys(total) as (keyof typeof total)[]) {
      total[key] += result.summary[key] ?? 0;
    }
  }
  const parts = [`Actualizado: ${summaryText(total)}`];
  if (failed > 0) {
    parts.push(
      failed === 1
        ? "1 calendario no se ha podido actualizar."
        : `${failed} calendarios no se han podido actualizar.`,
    );
  }
  return { message: parts.join(" ") };
}

/** Saves which calendars of the account are synced (RF-10, RF-11, RF-14). */
export async function saveSelection(
  _prev: SyncState,
  formData: FormData,
): Promise<SyncState> {
  const parsed = (() => {
    try {
      return selectionSchema.safeParse({
        connectionId: formData.get("connectionId"),
        calendars: formData
          .getAll("calendar")
          .map((value) => JSON.parse(String(value))),
        decision: formData.get("decision") || undefined,
      });
    } catch {
      return null;
    }
  })();
  if (!parsed?.success) {
    const tooMany = parsed?.error.issues.some((i) => i.path[0] === "calendars");
    return { formError: tooMany ? LIMIT : AUTH_MESSAGES.connection };
  }
  const { connectionId, calendars, decision } = parsed.data;

  const user = await requireActionUser();
  if (!(await ownsConnection(user, connectionId))) return { formError: GONE };

  const { data: synced } = await user.supabase
    .from("synced_calendars")
    .select("calendar_id, external_id")
    .eq("connection_id", connectionId);
  const chosen = new Set(calendars.map((c) => c.id));
  const current = new Set((synced ?? []).map((s) => s.external_id));
  const removed = (synced ?? []).filter((s) => !chosen.has(s.external_id));
  const added = calendars.filter((c) => !current.has(c.id));

  if (removed.length > 0 && !decision) {
    return {
      fieldErrors: {
        decision:
          "Elige si conservas o borras los calendarios que dejas de traer.",
      },
    };
  }

  let sync: ConnectionSync | null = null;
  try {
    if (removed.length > 0) {
      const { error } = await user.supabase.rpc("detach_synced_calendars", {
        p_connection_id: connectionId,
        p_calendar_ids: removed.map((s) => s.calendar_id),
        p_delete: decision === "delete",
      });
      if (error) return { formError: AUTH_MESSAGES.connection };
    }
    if (added.length > 0) {
      const { error } = await user.supabase.rpc("select_synced_calendars", {
        p_connection_id: connectionId,
        p_calendars: added.map((c) => ({
          external_id: c.id,
          name: c.name,
          color: nearestColor(c.color),
          access: c.access ?? null,
        })),
      });
      if (error) {
        return {
          formError: error.code === "CF429" ? LIMIT : AUTH_MESSAGES.connection,
        };
      }
      // The first load of the new calendars (plan "Flujo principal", step 4).
      sync = await syncConnection(connectionId, false);
    }
  } catch {
    return { formError: AUTH_MESSAGES.connection };
  }

  revalidatePath("/dashboard", "layout");
  return sync ? resultText(sync) : { message: "Cambios guardados." };
}

/** "Actualizar ahora" (RF-23, RF-24). Bound with the connection id. */
export async function syncNow(connectionId: string): Promise<SyncState> {
  if (!connectionIdSchema.safeParse(connectionId).success) {
    return { formError: GONE };
  }
  const user = await requireActionUser();
  if (!(await ownsConnection(user, connectionId))) return { formError: GONE };

  let sync: ConnectionSync;
  try {
    sync = await syncConnection(connectionId, true);
  } catch {
    return { formError: AUTH_MESSAGES.connection };
  }
  revalidatePath("/dashboard", "layout");
  return resultText(sync);
}

/**
 * Disconnects an account: revokes the token in Google, then keeps or deletes
 * its calendars (RF-27 to RF-30). Bound with the connection id.
 */
export async function disconnectAccount(
  connectionId: string,
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  if (!connectionIdSchema.safeParse(connectionId).success) {
    return { formError: GONE };
  }
  const user = await requireActionUser();
  const provider = await ownsConnection(user, connectionId);
  if (!provider) return { formError: GONE };

  const decision = formData.get("decision");
  const { data: synced } = await user.supabase
    .from("synced_calendars")
    .select("calendar_id")
    .eq("connection_id", connectionId);
  if (
    (synced ?? []).length > 0 &&
    decision !== "keep" &&
    decision !== "delete"
  ) {
    return {
      formError: "Elige si conservas o borras los calendarios de esta cuenta.",
    };
  }

  // Disconnecting goes on even if the provider does not answer (RF-30).
  await revokeConnection(connectionId, provider).catch(() => undefined);
  try {
    const { error } = await user.supabase.rpc("disconnect_account", {
      p_connection_id: connectionId,
      p_delete: decision === "delete",
    });
    if (error) return { formError: AUTH_MESSAGES.connection };
  } catch {
    return { formError: AUTH_MESSAGES.connection };
  }
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/connections");
}

/** A new calendar in the Google account, brought to CaFam (spec 009 RF-32, RF-33). */
export async function createGoogleCalendar(
  connectionId: string,
  _prevState: FormState<"name">,
  formData: FormData,
): Promise<FormState<"name">> {
  const values = { name: readString(formData, "name") };
  const parsed = calendarSchema.pick({ name: true }).safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod<"name">(parsed.error), values };
  }
  if (!connectionIdSchema.safeParse(connectionId).success) {
    return { formError: GONE, values };
  }

  const { supabase, userId } = await requireActionUser();
  const result = await createSyncedCalendar(writeEngineDeps(supabase), {
    connectionId,
    name: parsed.data.name,
    timeZone: await getProfileTimeZone(supabase, userId),
  });
  if (result.status === "failed") {
    return {
      formError: writeErrorText(result.failure, result.provider),
      values,
    };
  }
  if (result.status === "limit") return { formError: LIMIT, values };
  if (result.status === "notFound") return { formError: GONE, values };
  if (result.status === "forbidden") {
    return { formError: CALENDAR_MESSAGES.forbidden, values };
  }
  if (result.status === "dbError") {
    return { formError: AUTH_MESSAGES.connection, values };
  }

  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/connections/${connectionId}`);
}
