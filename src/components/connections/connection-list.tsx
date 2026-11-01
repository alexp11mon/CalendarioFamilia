import Link from "next/link";
import { FormAlert } from "@/components/ui/form-alert";
import { LinkButton } from "@/components/ui/link-button";
import { CONNECT_ERRORS, isConnectError } from "@/lib/sync/error-messages";
import { providerName } from "@/lib/sync/provider-labels";
import type { Connection } from "@/lib/sync/queries";

const LINK =
  "inline-flex min-h-11 items-center text-sm font-semibold text-ink underline decoration-control underline-offset-4 hover:decoration-ink";

/**
 * Connected accounts with the way back from the provider (RF-1, RF-3 to RF-5, RF-8,
 * RF-47). `error` is the raw ?error= code; unknown codes are ignored.
 */
export function ConnectionList({
  connections,
  error,
}: {
  connections: Connection[];
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      {isConnectError(error) ? (
        <FormAlert message={CONNECT_ERRORS[error]} />
      ) : null}

      <div className="flex flex-wrap gap-3">
        <LinkButton href="/dashboard/connections/new?provider=google">
          Conectar Google
        </LinkButton>
      </div>

      {connections.length === 0 ? (
        <p className="rounded-3xl bg-paper px-4 py-6 text-center text-ink">
          Aún no has conectado ninguna cuenta.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {connections.map((connection) => (
            <li
              key={connection.id}
              className="flex min-w-0 flex-col gap-1 rounded-3xl bg-paper p-4"
            >
              <span className="text-sm font-semibold text-muted">
                {providerName(connection.provider)}
              </span>
              <span className="truncate font-semibold text-ink">
                {connection.email}
              </span>
              <span
                className={
                  connection.status === "active" ? "text-ink" : "text-danger"
                }
              >
                {connection.status === "active"
                  ? "Conectada"
                  : "Hay que volver a conectarla"}
              </span>
              <Link
                href={`/dashboard/connections/${connection.id}`}
                aria-label={`Gestionar ${connection.email}`}
                className={`${LINK} self-start`}
              >
                Gestionar
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted">
        ¿Solo quieres una copia de un calendario de iCloud u otro servicio?{" "}
        <Link href="/dashboard/import" className={LINK}>
          Importar un .ics
        </Link>
      </p>
    </div>
  );
}
