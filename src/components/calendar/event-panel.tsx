"use client";

import { useState } from "react";
import { EventComments } from "@/components/comments/event-comments";
import { EventImages } from "@/components/images/event-images";
import { ImageUploader } from "@/components/images/image-uploader";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import type { EventImage } from "@/lib/images/queries";
import type {
  ConfirmState,
  FormAction,
  FormState,
} from "@/lib/forms/form-state";
import { EventDetail, type EventDetailData } from "./event-detail";
import {
  EventForm,
  type CalendarOption,
  type CategoryOption,
  type EventFormValues,
} from "./event-form";
import { useEventModal } from "./event-modal";

/**
 * An event's detail, which turns into its edit form in the same place
 * (spec 008 RF-2, RF-3, RF-35, RF-36). Used by the window and the full page.
 */
export function EventPanel({
  detail,
  timeZone,
  canEdit,
  editInitial,
  calendars,
  categories,
  updateAction,
  deleteAction,
  canAttach = false,
  images = [],
  series,
}: {
  detail: EventDetailData;
  timeZone: string;
  /** Owner or editor; readers get no buttons (RF-26, spec 008 RF-36). */
  canEdit: boolean;
  editInitial: EventFormValues;
  calendars: CalendarOption[];
  categories: CategoryOption[];
  updateAction: FormAction<FormState<keyof EventFormValues>>;
  deleteAction: FormAction<ConfirmState>;
  /** Any member adds images, viewers included (spec 012 RF-1, RF-4). */
  canAttach?: boolean;
  /** Ready images in upload order (spec 012 RF-9). */
  images?: EventImage[];
  /** An occurrence of a series (spec 013 RF-15). */
  series?: { limitReached: boolean } | null;
}) {
  const modal = useEventModal();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        <Button
          variant="secondary"
          onClick={() => setEditing(false)}
          className="self-start"
        >
          Volver al detalle
        </Button>
        <EventForm
          action={updateAction}
          initial={editInitial}
          calendars={calendars}
          categories={categories}
          submitLabel="Guardar cambios"
          pendingLabel="Guardando…"
          cancelHref="/dashboard/calendar"
          series={series ?? undefined}
        />
      </div>
    );
  }

  return (
    <EventDetail
      event={detail}
      timeZone={timeZone}
      canEdit={canEdit}
      deleteAction={deleteAction}
      onDeleted={modal?.finish}
      comments={<EventComments eventId={detail.id} timeZone={timeZone} />}
      media={
        <>
          <EventImages
            images={images}
            title={detail.title}
            timeZone={timeZone}
          />
          {canAttach ? <ImageUploader eventId={detail.id} /> : null}
        </>
      }
      actions={
        <>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
          <LinkButton
            href={`/dashboard/events/new?from=${detail.id}`}
            // Replace: saving the copy goes back to the calendar, not to this event.
            replace
            variant="secondary"
          >
            Duplicar
          </LinkButton>
        </>
      }
    />
  );
}
