"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { Select } from "@/components/ui/select";
import type { FormAction, FormState } from "@/lib/forms/form-state";
import { providerName } from "@/lib/sync/provider-labels";
import type { ProviderName } from "@/lib/sync/providers/types";

type UploadState = FormState<"connectionId">;

const count = (n: number) => `${n} ${n === 1 ? "evento" : "eventos"}`;

/**
 * Chooses the account and says what will be copied before uploading
 * (spec 009 RF-34, RF-35, RF-42, RF-43; spec 018 RF-57: Google or iCloud).
 */
export function UploadForm({
  accounts,
  toGoogle,
  onlyCafam,
  series = 0,
  occurrences = 0,
  action,
}: {
  accounts: { id: string; email: string; provider?: ProviderName }[];
  toGoogle: number;
  onlyCafam: number;
  /** Series and the occurrences they go up as (spec 013 RF-30). */
  series?: number;
  occurrences?: number;
  action: FormAction<UploadState>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    values: { connectionId: accounts[0]?.id ?? "" },
  });
  // Controlled only to name the chosen account's provider in the texts.
  const [chosen, setChosen] = useState(state.values.connectionId);
  const provider = providerName(
    accounts.find((a) => a.id === chosen)?.provider ?? "google",
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <FormAlert message={state.formError} />
      <Select
        label="Cuenta"
        name="connectionId"
        value={chosen}
        onChange={(event) => setChosen(event.target.value)}
        error={state.fieldErrors?.connectionId}
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {providerName(account.provider ?? "google")}: {account.email}
          </option>
        ))}
      </Select>
      <div className="flex flex-col gap-1 text-ink">
        <p className="tabular-nums">
          Se copiarán a {provider} <strong>{count(toGoogle)}</strong>.
        </p>
        {onlyCafam > 0 ? (
          <p className="tabular-nums">
            {count(onlyCafam)}{" "}
            {onlyCafam === 1
              ? "se quedará solo en CaFam: está fuera del rango que se sincroniza (de 6 meses antes de hoy a 1 año después) o pasa del máximo de 2.000."
              : "se quedarán solo en CaFam: están fuera del rango que se sincroniza (de 6 meses antes de hoy a 1 año después) o pasan del máximo de 2.000."}
          </p>
        ) : null}
        {series > 0 ? (
          <p className="tabular-nums">
            {series === 1 ? "1 serie se subirá" : `${series} series se subirán`}{" "}
            como{" "}
            {occurrences === 1
              ? "1 evento suelto"
              : `${occurrences} eventos sueltos`}
            ; las repeticiones fuera de la ventana se perderán.
          </p>
        ) : null}
        <p className="text-sm text-muted">
          Los miembros, las categorías y los colores siguen como están. Puede
          tardar unos minutos.
        </p>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Subiendo…" : `Subir a ${provider}`}
        </Button>
      </div>
    </form>
  );
}
