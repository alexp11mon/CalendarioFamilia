import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventPanel } from "@/components/calendar/event-panel";
import { PageShell } from "@/components/calendar/page-shell";
import { updateEvent } from "../actions";
import { deleteFromDetail } from "../quick-actions";
import { loadEvent } from "../load-event";

export const metadata: Metadata = { title: "Evento" };

// Reads the session and the route param, so it streams behind <Suspense> (cacheComponents).
async function Event({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadEvent(id);
  if (!data) notFound();

  return (
    <EventPanel
      detail={data.detail}
      timeZone={data.timeZone}
      canEdit={data.canEdit}
      canAttach={data.canAttach}
      images={data.images}
      editInitial={data.editInitial}
      series={data.series}
      calendars={data.calendars}
      categories={data.categories}
      updateAction={updateEvent.bind(null, id)}
      deleteAction={deleteFromDetail.bind(null, id)}
    />
  );
}

export default function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <PageShell
      title="Evento"
      backHref="/dashboard/calendar"
      backLabel="Volver al calendario"
    >
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <Event params={params} />
      </Suspense>
    </PageShell>
  );
}
