"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import type { FormAction } from "@/lib/forms/form-state";
import { MAX_CALENDARS_PER_ACCOUNT } from "@/lib/sync/limits";
import { providerName } from "@/lib/sync/provider-labels";
import type { ProviderAccess, ProviderName } from "@/lib/sync/providers/types";

export interface PickerCalendar {
  id: string;
  name: string;
  color: string | null;
  synced: boolean;
  /** Festivos, birthdays or shared without changes stay read-only (spec 009 RF-8). */
  access?: ProviderAccess | null;
}

interface PickerState {
  message?: string;
  formError?: string;
  fieldErrors?: { decision?: string };
}

/**
 * The account's calendars with a checkbox each (RF-9 to RF-12, RF-14). Unchecking
 * a synced one asks to keep or delete it before saving (RF-11, RF-27).
 */
export function CalendarPicker({
  connectionId,
  calendars,
  action,
  provider = "google",
}: {
  connectionId: string;
  provider?: ProviderName;
  calendars: PickerCalendar[];
  action: FormAction<PickerState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Controlled: the count and the keep-or-delete question depend on it.
  const [checked, setChecked] = useState(
    () => new Set(calendars.filter((c) => c.synced).map((c) => c.id)),
  );
  const limitId = useId();
  const decisionError = useId();
  const full = checked.size >= MAX_CALENDARS_PER_ACCOUNT;
  const dropping = calendars.some((c) => c.synced && !checked.has(c.id));

  const toggle = (id: string) =>
    setChecked((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="connectionId" value={connectionId} />
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 font-semibold text-ink">
          Calendarios que quieres traer
        </legend>
        {calendars.map((calendar) => {
          const isChecked = checked.has(calendar.id);
          return (
            <label
              key={calendar.id}
              className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-ink hover:bg-stone has-disabled:opacity-60"
            >
              <input
                type="checkbox"
                name="calendar"
                value={JSON.stringify({
                  id: calendar.id,
                  name: calendar.name,
                  color: calendar.color,
                  access: calendar.access ?? null,
                })}
                checked={isChecked}
                disabled={full && !isChecked}
                aria-describedby={full && !isChecked ? limitId : undefined}
                onChange={() => toggle(calendar.id)}
                className="size-5 accent-ink"
              />
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full ring-1 ring-pastel-ink/15"
                style={{ backgroundColor: calendar.color ?? undefined }}
              />
              <span className="min-w-0 truncate">{calendar.name}</span>
              {calendar.access === "reader" ? (
                <span className="ml-auto shrink-0 text-sm text-muted">
                  Solo lectura en {providerName(provider)}
                </span>
              ) : null}
            </label>
          );
        })}
      </fieldset>
      {full ? (
        <p id={limitId} className="text-sm text-muted">
          Has llegado al máximo de {MAX_CALENDARS_PER_ACCOUNT} calendarios por
          cuenta. Desmarca uno para elegir otro.
        </p>
      ) : null}

      {dropping ? (
        <fieldset
          className="flex flex-col gap-2 rounded-2xl border border-control p-4"
          aria-describedby={
            state.fieldErrors?.decision ? decisionError : undefined
          }
        >
          <legend className="px-1 font-semibold text-ink">
            ¿Qué hacemos con los calendarios que dejas de traer?
          </legend>
          <label className="flex min-h-11 items-center gap-3 text-ink">
            <input type="radio" name="decision" value="keep" required />
            Conservarlos como calendarios normales y editables
          </label>
          <label className="flex min-h-11 items-center gap-3 text-ink">
            <input type="radio" name="decision" value="delete" required />
            Borrarlos con sus eventos, también para quien los comparte
          </label>
          {state.fieldErrors?.decision ? (
            <p id={decisionError} role="alert" className="text-sm text-danger">
              {state.fieldErrors.decision}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <FormAlert message={state.formError} />
      <p role="status" className="text-ink empty:hidden">
        {state.message}
      </p>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
