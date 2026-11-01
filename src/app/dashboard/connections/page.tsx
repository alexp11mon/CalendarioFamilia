import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectionList } from "@/components/connections/connection-list";
import { requireUser } from "@/lib/calendar/queries";
import { getConnections } from "@/lib/sync/queries";

export const metadata: Metadata = { title: "Cuentas conectadas" };

// Reads the session and ?error, so it streams behind <Suspense> (cacheComponents).
async function Connections({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, { supabase }] = await Promise.all([
    searchParams,
    requireUser(),
  ]);
  return (
    <ConnectionList
      connections={await getConnections(supabase)}
      error={error}
    />
  );
}

/** Connected Google and iCloud accounts (spec 007; RF-1, RF-3 to RF-5, RF-8, RF-47). */
export default function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-ink">Cuentas conectadas</h1>
        <p className="text-muted">
          Trae tus calendarios de Google o iCloud y mantenlos al día. Lo que
          crees, cambies o borres en ellos en CaFam también cambia en tu cuenta.
        </p>
      </header>
      <Suspense fallback={<p className="text-muted">Cargando cuentas…</p>}>
        <Connections searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
