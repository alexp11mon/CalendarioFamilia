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
import { providerName } from "@/lib/sync/provider-labels";
import type { ProviderName } from "@/lib/sync/providers/types";
import { syncErrorText } from "@/lib/sync/summary";
import {
  createGoogleCalendar,
  disconnectAccount,
  saveSelection,
  syncNow,
} from "../actions";

export const metadata: Metadata = { title: "Cuenta conectada" };

// Reading Google's list and the first load of new calendars may take a while.
export const maxDuration = 60;

/** The provider's current list, or the reason it could not be read (RF-12, RF-31). */
async function readProviderList(
  connectionId: string,
  provider: ProviderName,
): Promise<{ list: ProviderCalendar[] } | { error: string }> {
  try {
    return { list: await providerCalendars(connectionId, provider) };
  } catch (error) {
    return {
      error:
        error instanceof ProviderError && error.kind === "revoked"
          ? syncErrorText("revoked", provider)
          : `No se ha podido leer la lista de calendarios de ${providerName(provider)}. Inténtalo más tarde.`,
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
      ? readProviderList(id, connection.provider)
      : Promise.resolve({
          error: syncErrorText("revoked", connection.provider),
        }),
  ]);
  const syncedIds = new Set(synced.map((c) => c.externalId));
  const sharedWith = await getSharedCounts(
    supabase,
    synced.map((c) => c.calendarId),
  );

  return (
    <>
      <section className="flex flex-col gap-3 rounded-3xl bg-paper p-4 sm:p-6">
        <p className="text-sm font-semibold text-muted">
          {providerName(connection.provider)}
        </p>
        <p className="truncate text-lg font-semibold text-ink">
          {connection.email}
        </p>
        {connection.status === "active" ? (
          <SyncNowButton action={syncNow.bind(null, id)} />
        ) : (
          <div className="flex flex-col gap-3">
            <FormAlert
              message={syncErrorText("revoked", connection.provider)}
            />
            <LinkButton
              href={
                connection.provider === "icloud"
                  ? `/dashboard/connections/new?provider=icloud&reconnect=${id}`
                  : "/dashboard/connections/new?provider=google"
              }
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
          <SyncStatus
            calendars={synced}
            timeZone={timeZone}
            provider={connection.provider}
          />
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
            provider={connection.provider}
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
            Crear un calendario en {providerName(connection.provider)}
          </h2>
          <p className="text-ink">
            Se crea en esta cuenta de {providerName(connection.provider)} y se
            trae a CaFam.
          </p>
          <CreateCalendarForm
            provider={connection.provider}
            action={createGoogleCalendar.bind(null, id)}
          />
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
            provider={connection.provider}
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

/** One connected account: its calendars, their state and the update (RF-9 to RF-14, RF-23, RF-26). */
export default function ConnectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ missing?: string | string[] }>;
}) {
  return (
    <PageShell
      title="Cuenta conectada"
      backHref="/dashboard/connections"
      backLabel="Volver a Cuentas conectadas"
    >
      <Suspense fallback={<p className="text-muted">Cargando la cuenta…</p>}>
        <ConnectionDetail params={params} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
