"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/text-field";
import type { FormAction, FormState } from "@/lib/forms/form-state";

type IcloudState = FormState<"appleId" | "password">;

/**
 * Apple ID and app-specific password (spec 018 RF-5 to RF-7). After an error
 * the Apple ID stays and the password field starts empty (RF-7, RF-12).
 */
export function IcloudConnectForm({
  action,
  appleId = "",
}: {
  action: FormAction<IcloudState>;
  appleId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    values: { appleId, password: "" },
  });

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-col gap-4 rounded-3xl bg-paper p-4 sm:p-6"
    >
      <FormAlert message={state.formError} />
      <TextField
        label="Apple ID"
        name="appleId"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue={state.values.appleId}
        error={state.fieldErrors?.appleId}
      />
      <TextField
        label="Contraseña específica de app"
        name="password"
        type="password"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue=""
        error={state.fieldErrors?.password}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Conectando…" : "Conectar iCloud"}
        </Button>
      </div>
    </form>
  );
}
