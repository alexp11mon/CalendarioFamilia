// Spanish texts for the OAuth return codes of /dashboard/connections (RF-4,
// RF-5, RF-8, RF-47).

export type ConnectError = "cancelled" | "failed" | "max";

export const CONNECT_ERRORS: Record<ConnectError, string> = {
  cancelled:
    "No se ha conectado la cuenta: se canceló la autorización en Google. Si no la cancelaste tú, puede que la aplicación no tenga plazas disponibles para usuarios nuevos.",
  failed:
    "No se ha podido conectar con Google. Inténtalo de nuevo dentro de un momento.",
  max: "Ya tienes 5 cuentas conectadas, el máximo. Desconecta una para conectar otra.",
};

export function isConnectError(value: unknown): value is ConnectError {
  return typeof value === "string" && Object.hasOwn(CONNECT_ERRORS, value);
}

/** Connecting iCloud (spec 018 RF-6, RF-8, RF-11). */
export const ICLOUD_CONNECT_ERRORS = {
  rejected:
    "iCloud no ha aceptado el Apple ID o la contraseña. Hace falta una contraseña específica de app creada en account.apple.com, no la contraseña normal del Apple ID.",
  transient:
    "iCloud no responde. No se ha conectado la cuenta; vuelve a intentarlo dentro de un momento.",
  max: CONNECT_ERRORS.max,
} as const;
