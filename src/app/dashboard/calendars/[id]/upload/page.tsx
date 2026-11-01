import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageShell } from "@/components/calendar/page-shell";
import { UploadForm } from "@/components/connections/upload-form";
import { LinkButton } from "@/components/ui/link-button";
import { requireUser } from "@/lib/calendar/queries";
import { getConnections } from "@/lib/sync/queries";
import { uploadCounts } from "@/lib/sync/upload-plan";
import { uploadToGoogle } from "./actions";
import { calendarEvents, uploadableCalendar } from "./load-upload";

export const metadata: Metadata = { title: "Subir a una cuenta conectada" };

// Copying up to 2,000 events to Google takes a while; Hobby allows 300 s (T1).
export const maxDuration = 300;

async function Upload({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await requireUser();
  // Own, normal and with an owner; anything else is a 404 (spec 009 RF-38).
  const calendar = await uploadableCalendar(supabase, userId, id);
  if (!calendar) notFound();

  const [events, connections] = await Promise.all([
    calendarEvents(supabase, id),
    getConnections(supabase),
  ]);
  const accounts = connections.filter(
    (c) => c.status === "active" && c.canWrite,
  );
  const counts = uploadCounts(events);

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-paper p-4 sm:p-6">
      <p className="text-ink">
        Se creará en la cuenta que elijas el calendario{" "}
        <span className="font-semibold">«{calendar.name}»</span> con sus
        eventos, y en CaFam pasará a estar conectado con ella.
      </p>
      {accounts.length > 0 ? (
        <UploadForm
          accounts={accounts.map(({ id, email, provider }) => ({
            id,
            email,
            provider,
          }))}
          toGoogle={counts.toGoogle}
          onlyCafam={counts.onlyCafam}
          series={counts.series}
          occurrences={counts.occurrences}
          action={uploadToGoogle.bind(null, id)}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-ink">
            Para subirlo necesitas una cuenta de Google o iCloud conectada que
            pueda escribir.
          </p>
          <div>
            <LinkButton href="/dashboard/connections">
              Cuentas conectadas
            </LinkButton>
          </div>
        </div>
      )}
    </section>
  );
}

/** Uploads a CaFam calendar to Google or iCloud (spec 009 RF-34 to RF-38, RF-42, RF-43; spec 018 RF-55 to RF-59). */
export default function UploadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <PageShell
      title="Subir a una cuenta conectada"
      backHref="/dashboard/calendars"
      backLabel="Volver a Mis calendarios"
    >
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <Upload params={params} />
      </Suspense>
    </PageShell>
  );
}
