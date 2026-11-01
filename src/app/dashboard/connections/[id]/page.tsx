import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageShell } from "@/components/calendar/page-shell";
import { CalendarPicker } from "@/components/connections/calendar-picker";
import { CreateCalendarForm } from "@/components/connections/create-calendar-form";
import { DisconnectDialog } from "@/components/connections/disconnect-dialog";
import { ReconnectNotice } from "@/components/connections/reconnect-notice";
import { SyncNowButton } from "@/components/connections/sync-now-button";
import { SyncStatus } from "@/components/connections/sync-status";
import { FormAlert } from "@/components/ui/form-alert";
import { LinkButton } from "@/components/ui/link-button";
import { getProfileTimeZone, requireUser } from "@/lib/calendar/queries";
import { providerCalendars } from "@/lib/sync/engine";
import {
  ProviderError,
  type ProviderCalendar,
} from "@/lib/sync/providers/google";
import {
  getConnection,
  getSharedCounts,
  getSyncedCalendars,
} from "@/lib/sync/queries";
import { connectionIdSchema } from "@/lib/sync/schemas";
import { missingFromQuery } from "@/lib/sync/scopes";
import { SYNC_ERRORS } from "@/lib/sync/summary";
import {
  createGoogleCalendar,
  disconnectAccount,
  saveSelection,
  syncNow,
} from "../actions";

export const metadata: Metadata = { title: "Cuenta de Google" };

// Reading Google's list and the first load of new calendars may take a while.
export const maxDuration = 60;

/** Google's current list, or the reason it could not be read (RF-12, RF-31). */
async function readGoogleList(
  connectionId: string,
  provider: string,
): Promise<{ list: ProviderCalendar[] } | { error: string }> {
  try {
    return { list: await providerCalendars(connectionId, provider) };
  } catch (error) {
    return {
      error:
        error instanceof ProviderError && error.kind === "revoked"
          ? SYNC_ERRORS.revoked
          : "No se ha podido leer la lista de calendarios de Google. Inténtalo más tarde.",
    };
  }
}

async function ConnectionDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ missing?: string | string[] }>;
}) {
  const { id } = await params;
  const { missing } = await searchParams;
  if (!connectionIdSchema.safeParse(id).success) notFound();
  const { supabase, userId } = await requireUser();
  const connection = await getConnection(supabase, id);
  if (!connection) notFound();

  const [synced, timeZone, google] = await Promise.all([
    getSyncedCalendars(supabase, id),
    getProfileTimeZone(supabase, userId),
    connection.status === "active"
      ? readGoogleList(id, connection.provider)
      : Promise.resolve({ error: SYNC_ERRORS.revoked }),
  ]);
  const syncedIds = new Set(synced.map((c) => c.externalId));
  const sharedWith = await getSharedCounts(
    supabase,
    synced.map((c) => c.calendarId),
  );

  return (
    <>
      <section className="flex flex-col gap-3 rounded-3xl bg-paper p-4 sm:p-6">
        <p className="text-sm font-semibold text-muted">Google</p>
        <p className="truncate text-lg font-semibold text-ink">
          {connection.email}
        </p>
        {connection.status === "active" ? (
          <SyncNowButton action={syncNow.bind(null, id)} />
        ) : (
          <div className="flex flex-col gap-3">
            <FormAlert message={SYNC_ERRORS.revoked} />
            <LinkButton
              href="/dashboard/connections/new?provider=google"
              className="self-start"
            >
              Volver a conectar
            </LinkButton>
          </div>
        )}
      </section>

      {connection.status === "active" && !connection.canWrite ? (
        <ReconnectNotice
          email={connection.email}
          missing={missingFromQuery(
            typeof missing === "string" ? missing : undefined,
          )}
        />
      ) : null}

      {synced.length > 0 ? (
        <section
          aria-labelledby="synced-heading"
          className="flex flex-col gap-3"
        >
          <h2 id="synced-heading" className="text-lg font-semibold text-ink">
            Calendarios traídos
          </h2>
          <SyncStatus calendars={synced} timeZone={timeZone} />
        </section>
      ) : null}

      <section aria-labelledby="pick-heading" className="flex flex-col gap-3">
        <h2 id="pick-heading" className="text-lg font-semibold text-ink">
          Elegir calendarios
        </h2>
        {"error" in google ? (
          <FormAlert message={google.error} />
        ) : (
          <CalendarPicker
            connectionId={id}
            action={saveSelection}
            calendars={google.list.map((calendar) => ({
              ...calendar,
              synced: syncedIds.has(calendar.id),
            }))}
          />
        )}
      </section>

      {connection.status === "active" && connection.canWrite ? (
        <section
          aria-labelledby="create-heading"
          className="flex flex-col gap-3"
        >
          <h2 id="create-heading" className="text-lg font-semibold text-ink">
            Crear un calendario en Google
          </h2>
          <p className="text-ink">
            Se crea en esta cuenta de Google y se trae a CaFam.
          </p>
          <CreateCalendarForm action={createGoogleCalendar.bind(null, id)} />
        </section>
      ) : null}

      <section
        aria-labelledby="disconnect-heading"
        className="flex flex-col gap-3 border-t border-line pt-6"
      >
        <h2 id="disconnect-heading" className="text-lg font-semibold text-ink">
          Desconectar la cuenta
        </h2>
        <p className="text-ink">
          Podrás conservar sus calendarios como normales o borrarlos.
        </p>
        <div>
          <DisconnectDialog
            email={connection.email}
            action={disconnectAccount.bind(null, id)}
            calendars={synced.map((c) => ({
              name: c.name,
              sharedWith: sharedWith.get(c.calendarId) ?? 0,
            }))}
          />
        </div>
      </section>
    </>
  );
}

/** One Google account: its calendars, their state and the update (RF-9 to RF-14, RF-23, RF-26). */
export default function ConnectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ missing?: string | string[] }>;
}) {
  return (
    <PageShell
      title="Cuenta de Google"
      backHref="/dashboard/connections"
      backLabel="Volver a Cuentas conectadas"
    >
      <Suspense fallback={<p className="text-muted">Cargando la cuenta…</p>}>
        <ConnectionDetail params={params} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
