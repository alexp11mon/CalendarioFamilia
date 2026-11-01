import { ConfirmDialog } from "@/components/calendar/confirm-dialog";
import type { ConfirmState, FormAction } from "@/lib/forms/form-state";
import { providerName } from "@/lib/sync/provider-labels";
import type { ProviderName } from "@/lib/sync/providers/types";

export interface DisconnectCalendar {
  name: string;
  /** People other than the owner who see it. */
  sharedWith: number;
}

function people(n: number) {
  return `${n} ${n === 1 ? "persona" : "personas"}`;
}

/**
 * Disconnecting says what it affects and asks keep or delete, with nothing
 * chosen beforehand (RF-27 to RF-29).
 */
export function DisconnectDialog({
  email,
  calendars,
  action,
  provider = "google",
}: {
  email: string;
  provider?: ProviderName;
  calendars: DisconnectCalendar[];
  action: FormAction<ConfirmState>;
}) {
  const shared = calendars.filter((c) => c.sharedWith > 0);
  const count = calendars.length;
  const description =
    count === 0
      ? `La cuenta ${email} no trae ningún calendario a CaFam.`
      : `La cuenta ${email} trae ${count} ${count === 1 ? "calendario" : "calendarios"} a CaFam.`;

  return (
    <ConfirmDialog
      triggerLabel="Desconectar"
      title={`¿Desconectar la cuenta de ${providerName(provider)}?`}
      description={`${description} CaFam dejará de tener permiso en tu cuenta de ${providerName(provider)}.`}
      confirmLabel="Sí, desconectar"
      action={action}
    >
      {shared.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p>Están compartidos:</p>
          <ul className="list-disc pl-5">
            {shared.map((calendar) => (
              <li key={calendar.name}>
                «{calendar.name}», con {people(calendar.sharedWith)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {count > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">
            ¿Qué hacemos con sus calendarios?
          </legend>
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" name="decision" value="keep" required />
            Conservarlos como calendarios normales y editables
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" name="decision" value="delete" required />
            Borrarlos con sus eventos, también para quien los comparte
          </label>
        </fieldset>
      ) : null}
    </ConfirmDialog>
  );
}
