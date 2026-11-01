import Link from "next/link";

const LINK =
  "font-semibold underline decoration-control underline-offset-4 hover:decoration-ink";

/** What an iCloud connection needs and what it opens (spec 018 RF-2 to RF-4). */
export function IcloudNotice() {
  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-paper p-4 text-ink sm:p-6">
      <p>
        Para conectar iCloud hace falta una{" "}
        <strong>contraseña específica de app</strong>, no la contraseña normal
        de tu Apple ID. Apple solo deja crearla si tu Apple ID tiene la
        verificación en dos pasos.
      </p>
      <ol className="flex list-decimal flex-col gap-1 pl-5">
        <li>
          Entra en{" "}
          <a
            href="https://account.apple.com/"
            target="_blank"
            rel="noreferrer"
            className={LINK}
          >
            account.apple.com
          </a>{" "}
          con tu Apple ID.
        </li>
        <li>
          En «Inicio de sesión y seguridad», elige «Contraseñas específicas de
          app».
        </li>
        <li>
          Crea una con un nombre como «CaFam» y copia la contraseña que te
          muestra, con la forma abcd-efgh-ijkl-mnop.
        </li>
        <li>Escríbela abajo junto a tu Apple ID.</li>
      </ol>
      <p>
        Esa contraseña también da acceso a tu correo y a tus contactos de
        iCloud, pero CaFam solo usa los calendarios. Puedes revocarla cuando
        quieras en account.apple.com, y CaFam dejará de tener acceso.
      </p>
      <p>
        <Link href="/privacy" className={LINK}>
          Política de privacidad
        </Link>
      </p>
    </div>
  );
}
