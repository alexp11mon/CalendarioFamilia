import { Suspense } from "react";
import { EventModal } from "@/components/calendar/event-modal";
import { EventPanel } from "@/components/calendar/event-panel";
import { GoneEvent } from "@/components/calendar/gone-event";
import { updateEvent } from "../../../events/actions";
import { deleteFromDetail } from "../../../events/quick-actions";
import { loadEvent } from "../../../events/load-event";

// Reads the session and the route param, so it streams behind <Suspense> (cacheComponents).
async function InterceptedEvent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadEvent(id);
  // Deleting from the window re-renders this route: the event is gone, and a
  // 404 here would replace the whole page.
  if (!data) return <GoneEvent />;

  return (
    <EventModal title={data.detail.title}>
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
    </EventModal>
  );
}

// An event opened from inside the app shows over the calendar (spec 008 RF-2, plan D1).
export default function InterceptedEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <InterceptedEvent params={params} />
    </Suspense>
  );
}
