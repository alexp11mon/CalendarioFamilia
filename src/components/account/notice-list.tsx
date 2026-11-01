"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import type { AccountNotice } from "@/lib/account/queries";
import type { ConfirmState } from "@/lib/forms/form-state";

type DismissAction = (noticeId: string) => Promise<ConfirmState>;

function noticeText(notice: AccountNotice): string {
  switch (notice.kind) {
    case "orphaned":
      return `${notice.personName || "Una persona"} ha eliminado su cuenta. El calendario «${notice.calendarName}» se queda sin propietario: decide si lo conservas o sales de él.`;
    case "kept_copy":
      return `Ya tienes tu copia de «${notice.calendarName}» en tu lista.`;
    case "deleted_calendar":
      return `El calendario «${notice.calendarName}» se ha eliminado porque nadie decidió conservarlo.`;
    case "sync_revoked":
      return notice.provider === "icloud"
        ? `iCloud ya no acepta la contraseña de la cuenta ${notice.calendarName}. Pasa al cambiar la contraseña del Apple ID o al revocar la contraseña específica de app. Sus calendarios se conservan, pero no se actualizan: vuelve a conectarla con una contraseña nueva.`
        : `Google ha retirado el permiso de CaFam en la cuenta ${notice.calendarName}. Sus calendarios se conservan, pero no se actualizan.`;
    case "sync_failing":
      return `La actualización de «${notice.calendarName}» ha fallado 3 veces seguidas. Se seguirá intentando.`;
  }
}

// Sync notices lead to the account (spec 007; RF-31, RF-34).
const NOTICE_LINKS: Partial<
  Record<AccountNotice["kind"], { href: string; label: string }>
> = {
  sync_revoked: {
    href: "/dashboard/connections/new?provider=google",
    label: "Volver a conectar",
  },
  sync_failing: {
    href: "/dashboard/connections",
    label: "Ver cuentas conectadas",
  },
};

function NoticeItem({
  notice,
  dismissAction,
}: {
  notice: AccountNotice;
  dismissAction: DismissAction;
}) {
  const [state, formAction, pending] = useActionState(
    dismissAction.bind(null, notice.id),
    {},
  );
  const link =
    notice.kind === "sync_revoked" && notice.provider === "icloud"
      ? {
          href: `/dashboard/connections/new?provider=icloud${notice.connectionId ? `&reconnect=${notice.connectionId}` : ""}`,
          label: "Volver a conectar",
        }
      : NOTICE_LINKS[notice.kind];

  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-paper p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="break-words text-ink">{noticeText(notice)}</p>
        {link ? (
          <Link
            href={link.href}
            className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-ink underline decoration-control underline-offset-4 hover:decoration-ink"
          >
            {link.label}
          </Link>
        ) : null}
        <FormAlert message={state.formError} />
      </div>
      <form action={formAction} className="shrink-0">
        <Button
          type="submit"
          variant="secondary"
          disabled={pending}
          aria-label={`Cerrar aviso sobre «${notice.calendarName}»`}
        >
          Cerrar
        </Button>
      </form>
    </li>
  );
}

/** Account notices: someone left, a copy is ready, a calendar was deleted (spec 006, RF-23). */
export function NoticeList({
  notices,
  dismissAction,
}: {
  notices: AccountNotice[];
  dismissAction: DismissAction;
}) {
  if (notices.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3">
      {notices.map((notice) => (
        <NoticeItem
          key={notice.id}
          notice={notice}
          dismissAction={dismissAction}
        />
      ))}
    </ul>
  );
}
