# Plan 018 — Sincronización con iCloud (calendarios del iPhone)

> Spec de origen: `specs/018-sincronizacion-icloud/spec.md` (aprobada, 2026-11-01). Constitución: `docs/constitution.md` (enmienda 6). Parte de los planes 007 y 009, cuyos módulos, funciones y decisiones siguen vigentes salvo lo que se cambia aquí.
> Estado: **Aprobado** por el usuario (2026-11-01).
> Fuentes consultadas el 2026-11-01: soporte de Apple (`support.apple.com/102654`, contraseñas específicas de app), guías de Nylas y apiroc/onecal sobre CalDAV de iCloud, y el paquete `tsdav@2.5.0` (publicado el 2026-10-15, MIT; dependencias `debug` y `xml-js`; tipos revisados en el scratchpad, sin instalarlo). Lo que no pude confirmar sin una cuenta real está en "Comprobaciones de la T1".

## Resumen de arquitectura

Se mantiene el diseño de la 007 y la 009. El motor de sincronización (`run-sync.ts`), la escritura de eventos (`write-event.ts`), la subida y la creación de calendarios dejan de llamar directamente al cliente de Google: hablan con una **interfaz de proveedor** que tiene dos implementaciones, `providers/google.ts` (sin cambios de comportamiento) y `providers/icloud.ts` (nuevo, con `tsdav`). Postgres sigue decidiendo quién puede hacer qué con las mismas funciones `sync_*` y el mismo secreto (P3 y P4): solo se amplía el `check` de `provider` y se guarda la credencial de iCloud en Vault igual que el token de Google.

La diferencia de fondo es el formato: Google da eventos ya expandidos en JSON y acepta cambios parciales; iCloud guarda cada evento (o cada serie con sus excepciones) como un recurso `.ics` y solo acepta reescribirlo entero. Por eso el lado iCloud lee y escribe `.ics` con `ical.js` (ya aprobada) en un módulo propio.

```
Conectar:  /connections/new?provider=icloud ── aviso (RF-2..RF-4) + formulario ──▶ connectIcloud (Server Action)
              ──▶ icloud.verify (descubrimiento CalDAV con Basic) ──▶ rpc connect_account('icloud', appleId, JSON credencial, can_write=true)

Leer:      runSync ── sync_claim_* (provider) ──▶ providers/index.ts ──▶ icloud.listEvents(ventana)
              REPORT calendar-query con time-range ──▶ icloud-ics.expand (ical.js) ──▶ SyncedEventRow[] ──▶ sync_apply_events (igual que Google)

Escribir:  createEvent/updateEvent/deleteEvent ──▶ write-event.ts ──▶ sync_write_context ──▶ icloud.write*
              GET recurso + ETag ──▶ icloud-ics.patch (ical.js, conserva lo que CaFam no muestra) ──▶ PUT If-Match ──▶ sync_commit_event
```

## Módulos y responsabilidades

### SQL: una migración nueva (`icloud_provider`)

- Sustituye el `check` de `provider` en `calendar_connections` y `synced_calendars` por `provider in ('google', 'microsoft', 'icloud')`. Nada más cambia: el resto de funciones no distinguen proveedor. Cubre: RF-5, RF-9 a RF-11, RF-70.
- `connect_account` no cambia de firma: el "token" que guarda en Vault es, para iCloud, un JSON con el Apple ID y la contraseña (D3). Su límite de 5 cuentas ya cuenta todas las conexiones del usuario sin mirar el proveedor (comprobado en `sync_connect_functions`, RF-11).
- `synced_calendars.google_access` se reutiliza para el permiso del calendario en iCloud (D8). No se renombra: renombrar una columna obliga a recrear funciones ya aplicadas.

### Interfaz de proveedor (`src/lib/sync/providers/`)

- `types.ts` (nuevo, puro): la interfaz `SyncProvider` con `listCalendars`, `listEvents(window)`, `insertEvent`, `updateEvent`, `moveEvent`, `deleteEvent`, `insertCalendar`, `renameCalendar`, `deleteCalendar` y `revoke`, más `ProviderError` y `FailureKind`, que se mueven aquí desde `google.ts` (sin cambiar su forma; `google.ts` los reexporta). Cubre: RF-29 a RF-60.
- `index.ts` (nuevo, solo servidor): `providerFor(provider)` devuelve la implementación de Google o la de iCloud. Cubre: todas las rutas del motor.
- `google.ts`: se adapta a la interfaz sin cambiar sus llamadas ni sus tests (D1). Cubre: lo de la 007 y la 009.
- `icloud.ts` (nuevo, solo servidor, único módulo que importa `tsdav`):
  - Descubre la cuenta (`/.well-known/caldav` → principal → `calendar-home-set`) con autenticación Basic (Apple ID + contraseña específica de app).
  - Lista los calendarios con nombre, color, componentes admitidos y privilegios (`current-user-privilege-set`); descarta los que no admiten `VEVENT` (RF-14) y traduce los privilegios a `owner | writer | reader` (RF-20).
  - Lee los eventos de la ventana con `calendar-query` y `time-range`, sin pedir a iCloud que expanda (D5).
  - Escribe con `PUT` (`If-None-Match: *` al crear, `If-Match` con el ETag recién leído al cambiar), `DELETE`, `MKCALENDAR`, `PROPPATCH` de `displayname` y mueve según la T1 (D9).
  - Pasa a `tsdav` un `fetch` propio (`fetchOverride`) que solo deja salir peticiones `https` a `caldav.icloud.com` o `pNN-caldav.icloud.com` y aplica el plazo de la escritura (D10, D12).
  - Clasifica los errores en `ProviderError` (D11).

  Cubre: RF-5, RF-6, RF-8, RF-13, RF-14, RF-17, RF-19, RF-20, RF-21, RF-29 a RF-32, RF-37, RF-41, RF-45 a RF-48, RF-52, RF-54, RF-55, RF-59, RF-61, RF-63.

### Lógica de iCloud (`src/lib/sync/`)

- `icloud-ics.ts` (nuevo, solo servidor, importa `ical.js`; se añade a la lista permitida de `no-secrets.test.ts`):
  - `expandObject(href, ics, window)`: convierte un recurso en filas `SyncedEventRow`, expandiendo las series en la ventana, respetando `EXDATE`, `RECURRENCE-ID` y `STATUS:CANCELLED`, y omitiendo las zonas no reconocidas (reutiliza `zonedLocalToUtc` y `buildRow`). El `external_id` es `href` para un evento suelto y `href#<RECURRENCE-ID en UTC o fecha>` para una repetición (D6). Cubre: RF-21 a RF-26.
  - `newEventIcs(row, uid)`: el `.ics` de un evento nuevo (día completo con `VALUE=DATE` y fin exclusivo, con hora en UTC). Cubre: RF-38.
  - `patchIcs(ics, recurrenceId | null, before, after)`: cambia en el recurso solo los campos de CaFam que cambiaron (título, inicio, fin, día completo, descripción y lugar) y deja intacto el resto (alarmas, invitados, `URL`, adjuntos, color). En una repetición crea o actualiza su `VEVENT` con `RECURRENCE-ID`. Cubre: RF-38 a RF-40.
  - `removeOccurrence(ics, recurrenceId)`: añade `EXDATE` y quita el `VEVENT` de excepción si lo había. Cubre: RF-40.
- `icloud-credentials.ts` (nuevo, puro): normaliza el Apple ID (minúsculas, sin espacios) y la contraseña (quita espacios; los guiones según la T1) y serializa la credencial para Vault. Cubre: RF-5, RF-7, casos límite de formato.
- `parse-ics.ts` (spec 004) **no cambia**: la importación sigue igual. `icloud-ics.ts` reutiliza sus tipos y `convert-events.ts`, no su función principal, porque necesita el `RECURRENCE-ID` de cada repetición y otra ventana (D5).

### Motor y escritura (se amplían)

- `run-sync.ts`: `accessToken` pasa a `credentialFor(connectionId, provider)`: Google renueva el token como hoy; iCloud lee el JSON de Vault con `sync_get_token`. `syncOne` llama a `providerFor(calendar.provider).listEvents`. `sync_claim_due` y `sync_claim_connection` ya devuelven `provider`. Cubre: RF-29 a RF-33, RF-50, RF-61, RF-63, RF-64.
- `engine.ts`: `providerCalendars` y `revokeConnection` usan `providerFor`. Para iCloud, `revoke` no hace nada (RF-67). Cubre: RF-13, RF-17, RF-20, RF-66.
- `write-event.ts`: usa la interfaz en vez de `insertEvent`/`patchEvent` de Google. El orden "proveedor primero, CaFam después", el plazo de 9 s y los resultados (`done`, `gone`, `failed`, `dbError`) no cambian. Cubre: RF-34, RF-37, RF-41, RF-45 a RF-49.
- `write-calendar.ts` y `upload-calendar.ts`: igual, con la interfaz. La subida a iCloud crea el calendario con `MKCALENDAR`, sube los eventos con `PUT` de cuatro en cuatro y, si algo falla, borra la colección recién creada (RF-59). Cubre: RF-52, RF-54 a RF-60.
- `google-payload.ts`: sin cambios; `toGooglePatch` sigue decidiendo qué campos cambiaron y `icloud-ics.patchIcs` recibe esa misma lista (D7).

### Textos y reglas de pantalla (puros, válidos en el navegador)

- `provider-labels.ts` (nuevo): `PROVIDER_NAMES = { google: "Google", icloud: "iCloud" }` y los textos que hoy dicen "Google" en la ficha de la cuenta, el detalle del evento, los avisos y "Subir a…" pasan a recibir el proveedor. Cubre: RF-1, RF-20, RF-33, RF-43, RF-62.
- `write-errors.ts`: `WRITE_ERRORS` pasa a `writeErrorText(failure, provider)` con los mismos textos de la 009 y sus equivalentes para iCloud ("iCloud no responde…", "iCloud no ha permitido el cambio…", "Este evento se había borrado en iCloud…"), y para `revoked` en iCloud: "iCloud ya no acepta la contraseña de esta cuenta. Vuelve a conectarla con una contraseña específica de app nueva." Cubre: RF-45 a RF-48, RF-51, RF-62.
- `read-only.ts`: `readOnlyReason` devuelve `"provider"` en lugar de `"google"` y `SyncedInfo` gana `provider`. Las reglas de `canWriteEvents`, `moveTargets` y `canMerge` no cambian: ya impiden mover entre conexiones distintas (RF-42) y juntar traídos (RF-70). Cubre: RF-20, RF-28, RF-34 a RF-36, RF-42, RF-70.
- `error-messages.ts` y `schemas.ts` (sync): mensajes del formulario de conexión de iCloud y esquema `zod` del Apple ID (email) y la contraseña (no vacía, 16 letras tras normalizar). Cubre: RF-6 a RF-8.

### Rutas, acciones y pantallas

- `/dashboard/connections`: botón "Conectar iCloud" junto a "Conectar Google" (RF-1). La lista muestra "iCloud" y el Apple ID (RF-5).
- `/dashboard/connections/new?provider=icloud` (página existente, nueva rama): aviso `icloud-notice.tsx` con los pasos para crear la contraseña en account.apple.com, la necesidad de la verificación en dos pasos, el alcance de la contraseña y el enlace a `/privacy` (RF-2 a RF-4), seguido de `icloud-connect-form.tsx` (Apple ID y contraseña, campo `type="password"` con `autocomplete="off"`). Con `?reconnect=<id>` rellena el Apple ID (RF-62).
- `connectIcloud` (en `connections/actions.ts`): valida con `zod`, comprueba la credencial con un descubrimiento real (`icloud.verify`) en 10 s, y llama a `connect_account('icloud', appleId, appleId, credencialJSON, true)`. Devuelve `FormState` con `values.appleId` y la contraseña vacía (RF-7, RF-12). Si la cuenta ya existía, reemplaza la credencial y reanuda (RF-9). Redirige a la ficha de la cuenta. Cubre: RF-5 a RF-12.
- La ruta OAuth `/api/oauth/[provider]/start` sigue aceptando solo `google`: iCloud nunca pasa por ella.
- Ficha de la cuenta (`/dashboard/connections/[id]`): igual que con Google (RF-13 a RF-20, RF-30, RF-31, RF-54); "Solo lectura en iCloud" (RF-20). Si la T1 confirma que iCloud no deja renombrar, `renameSyncedCalendar` rechaza el cambio de nombre de un calendario de iCloud y el formulario de edición lo deshabilita con su motivo (decisión del usuario del 2026-11-01, enmienda a RF-52).
- Diálogo de desconexión (`disconnect-dialog.tsx`): para iCloud añade el recordatorio de revocar la contraseña en la cuenta de Apple (RF-65 a RF-67).
- `reconnect-notice.tsx` y `notice-list.tsx`: el aviso `sync_revoked` de una cuenta de iCloud explica que cambiar la contraseña del Apple ID invalida las específicas de app y enlaza a `new?provider=icloud&reconnect=<id>` (RF-61, RF-62).
- `/dashboard/calendars/[id]/upload`: el selector de cuenta ofrece también las de iCloud con escritura y el título dice "Subir a Google" o "Subir a iCloud" según la cuenta elegida (RF-55 a RF-60).
- `/privacy`: sección de iCloud (RF-69).
- Formularios de evento, ventana rápida, arrastre y detalle: sin cambios de lógica; los textos con "Google" usan `provider-labels` (RF-27, RF-28, RF-36, RF-43).

No hacen: nada de esto lee correo, contactos o recordatorios, borra calendarios en iCloud por decisión del usuario, ni revoca la contraseña en Apple.

## Modelo de datos

- `calendar_connections.provider` y `synced_calendars.provider`: `check in ('google','microsoft','icloud')` (migración `icloud_provider`).
- `calendar_connections` para iCloud: `account_subject` = Apple ID normalizado (identifica la cuenta, RF-9, RF-10); `account_email` = el mismo Apple ID (lo que se muestra, RF-5); `can_write = true` siempre (D3); `status` como en la 007.
- Vault (`calendar_connection_secrets` → `vault.secrets`): para iCloud, el texto `{"v":1,"username":"<Apple ID>","password":"<contraseña normalizada>"}`. Se crea y se reemplaza con `connect_account`, se lee solo con `sync_get_token` (secreto del servidor) y se borra con la conexión (trigger de la 007, RF-66).
- `synced_calendars.external_id` para iCloud: la ruta de la colección (`/<dsid>/calendars/<id>/`), sin el host `pNN-caldav`, que puede cambiar; el host se descubre en cada uso (D4).
- `events.external_id` para iCloud: `href` del recurso o `href#<RECURRENCE-ID>` (D6). Sin columnas nuevas.
- `synced_calendars.google_access`: `owner` si la cuenta es dueña del calendario, `writer` si tiene `write-content`, `reader` si no (D8).
- Sin variables de entorno nuevas ni secretos nuevos en Vault.

## Contratos e interfaces

`SyncProvider` (TypeScript, `providers/types.ts`):

| Método | iCloud (CalDAV) |
|--------|-----------------|
| `listCalendars(cred)` → `{id, name, color, access}[]` | `PROPFIND` depth 1 sobre `calendar-home-set` (`displayname`, `calendar-color`, `supported-calendar-component-set`, `current-user-privilege-set`) |
| `listEvents(cred, calendarId, window)` → `{events, skipped, access}` | `REPORT calendar-query` con `time-range` → `icloud-ics.expandObject` por recurso |
| `insertEvent(cred, calendarId, row)` → `externalId` | `PUT <colección>/<uuid>.ics` con `If-None-Match: *` |
| `updateEvent(cred, calendarId, externalId, before, after)` | `GET` (ETag) → `patchIcs` → `PUT If-Match`; un `412` reintenta una vez desde el `GET` |
| `moveEvent(cred, from, externalId, to)` → `externalId` | Según la T1: `MOVE` con `Destination`, o `PUT` en el destino y `DELETE` en el origen (D9). Una repetición no se mueve sola: `rejected` |
| `deleteEvent(cred, calendarId, externalId)` | Suelto: `DELETE If-Match`. Repetición: `GET` → `removeOccurrence` → `PUT If-Match` |
| `insertCalendar(cred, name)` → `calendarId` | `MKCALENDAR <home>/<uuid>/` con `displayname` y solo `VEVENT` |
| `renameCalendar(cred, calendarId, name)` | `PROPPATCH displayname` (si la T1 lo confirma) |
| `deleteCalendar(cred, calendarId)` | `DELETE` de la colección; solo para deshacer RF-59 y RF-54 |
| `revoke(cred)` | Nada (RF-67) |

Errores de iCloud → `ProviderError.kind` (D11):

| Respuesta | `kind` |
|-----------|--------|
| `401` | `revoked` (RF-61) |
| `403`, `409`, `415`, `507`, `412` tras el reintento | `rejected` (RF-47) |
| `404`, `410` | `missing` (RF-19 al leer, `gone` al escribir, RF-48) |
| `429`, `5xx`, plazo agotado, red, host no permitido en una redirección | `transient` (RF-46, RF-63) |

Server Action nueva: `connectIcloud(prevState, formData)` (campos `appleId`, `password`, `reconnect?`) → `FormState` con `formError` en español (`invalid`, `unreachable`, `max`) o `redirect` a `/dashboard/connections/<id>`.

Funciones SQL: las mismas de la 007 y la 009. `connect_account(p_provider => 'icloud', p_subject, p_email, p_refresh_token => <JSON>, p_can_write => true)`.

## Flujo principal paso a paso

Caso central: conectar iCloud, traer un calendario y cambiar una repetición desde CaFam.

1. El usuario pulsa "Conectar iCloud" (RF-1). La página `new?provider=icloud` muestra el aviso con los pasos, el alcance de la contraseña y el enlace a `/privacy` (RF-2 a RF-4).
2. Escribe su Apple ID y la contraseña específica de app. `connectIcloud` normaliza y valida (casos límite), y `icloud.verify` hace el descubrimiento con Basic en menos de 10 s. Un `401` da el mensaje de RF-6 y conserva el Apple ID (RF-7); un fallo de red, RF-8.
3. `connect_account` guarda la credencial en Vault y crea o reactiva la conexión (RF-9 a RF-11). La contraseña no vuelve al navegador (RF-12). Redirige a la ficha.
4. La ficha llama a `providerCalendars`: `PROPFIND` de la colección, solo calendarios de eventos, con su permiso guardado con `sync_set_access` (RF-13, RF-14, RF-17, RF-20). El usuario marca uno; `select_synced_calendars` crea el calendario con el color más cercano (RF-15, RF-18) y lanza la primera actualización.
5. `runSync` pide los recursos de la ventana con `calendar-query`, los expande con `icloud-ics` (RF-21 a RF-25), limita a 2.000 (RF-26) y llama a `sync_apply_events` con `p_read_at` (RF-32, RF-50). Cada hora, `pg_cron` repite lo que tenga más de 5 horas (RF-29).
6. Un Editor cambia la hora de una repetición. `write-event` llama a `sync_write_context` (rol y escritura, RF-34, RF-35), lee el recurso de la serie con su ETag, `patchIcs` añade o actualiza el `VEVENT` con su `RECURRENCE-ID` sin tocar alarmas ni invitados (RF-38 a RF-40) y hace `PUT If-Match` en menos de 9 s.
7. Si iCloud acepta, `sync_commit_event('update')` guarda en CaFam y la ventana muestra "Cambios guardados" (RF-37, RF-43). Si no, el mensaje de RF-45 a RF-48 y nada se guarda. Un `401` además pone la conexión en `needs_reauth` con su aviso (RF-61, RF-62).
8. Si el usuario cambia la contraseña de su Apple ID, la siguiente actualización recibe `401`, `sync_fail('revoked')` deja de actualizar y crea el aviso con "Volver a conectar" (RF-61, RF-62). Volver a conectar con una contraseña nueva reutiliza la conexión (RF-9).
9. Al desconectar, el diálogo pide conservar o borrar (RF-65), `disconnect_account` borra la credencial (RF-66) y el diálogo recuerda revocar la contraseña en Apple (RF-67). En iCloud no se borra nada (RF-68).

## Decisiones técnicas

- D1: Una interfaz `SyncProvider` con dos implementaciones y `providerFor(provider)`. Descartado: un `if (provider === "icloud")` en cada función del motor, que duplicaría el orden "proveedor primero" y los plazos en cada sitio. Motivo: el motor, la escritura y la subida de la 009 ya están probados y no cambian de lógica. Cubre: RF-29 a RF-60.
- D2: `tsdav` (aprobada por el usuario el 2026-11-01) solo en `providers/icloud.ts`, del servidor. Descartado: `fast-xml-parser` con las peticiones CalDAV a mano (más código propio) y un lector de XML propio (frágil). Motivo: resuelve el descubrimiento de iCloud, `calendar-query`, ETags y `MKCALENDAR`, y admite un `fetch` inyectado para los tests y el control de hosts. `no-secrets.test.ts` impide que un componente de cliente lo importe. Cubre: RF-5, RF-13, RF-21, RF-37, RF-54.
- D3: La credencial de iCloud se guarda como JSON en el mismo secreto de Vault que el token de Google, con `connect_account` sin cambios, y `can_write = true`. Descartado: columnas o funciones nuevas para la contraseña (más superficie) y cifrarla en la aplicación (otra clave que guardar). Motivo: Vault ya protege el token de Google con las mismas reglas (P4), y una contraseña específica de app siempre permite escribir; el permiso real de cada calendario lo da D8. Cubre: RF-9, RF-12, RF-66.
- D4: El `external_id` del calendario es la ruta sin host, y el host `pNN-caldav.icloud.com` se descubre en cada actualización o escritura. Descartado: guardar la URL completa, que se rompería si Apple mueve la cuenta a otra partición. Motivo: el descubrimiento son dos `PROPFIND` y el ritmo de actualización es bajo (RF-29). Cubre: RF-29, RF-37.
- D5: CaFam expande las series con `ical.js` en vez de pedir a iCloud `expand` en el `REPORT`. Descartado: `<C:expand>` de CalDAV, que iCloud no documenta y que pierde el `.ics` original que hace falta para escribir. Motivo: `ical.js` ya expande las series de la importación y de la 013, con `EXDATE`, `RECURRENCE-ID` y cancelados. Cubre: RF-21 a RF-23.
- D6: Una repetición de iCloud se identifica en CaFam como `href#<RECURRENCE-ID>` (UTC o fecha), y un evento suelto por su `href`. Descartado: guardar el `UID` (no dice en qué recurso está) o una tabla de correspondencias. Motivo: con el `external_id` la escritura sabe qué recurso leer y qué `VEVENT` tocar, sin columnas nuevas; `sync_apply_events` reconcilia por `external_id` como con Google. Cubre: RF-22, RF-32, RF-40.
- D7: Para cambiar, se lee el recurso, se modifican con `ical.js` solo los campos que cambiaron (los que da `toGooglePatch`) y se reescribe con `PUT If-Match` y el ETag recién leído. Un `412` reintenta una vez desde la lectura. Descartado: generar el `.ics` desde cero (borraría alarmas, invitados y adjuntos) y usar el ETag de la última actualización (convertiría cualquier cambio del iPhone en un rechazo, contra "gana el último"). Motivo: RF-39 y RF-49; el `If-Match` solo evita pisar un cambio de los milisegundos entre leer y escribir. Cubre: RF-38, RF-39, RF-49.
- D8: El permiso de cada calendario sale de `current-user-privilege-set` (`write-content` → escritura; dueño de la colección → `owner`) y se guarda en `google_access`, que no se renombra. Descartado: una columna nueva `access` (recrear `can_write_synced` y las funciones de la 009). Motivo: los valores `owner | writer | reader` sirven igual; el nombre se explica en un comentario de la migración. Cubre: RF-20, RF-34.
- D9: Mover entre calendarios de la misma cuenta con `MOVE` de WebDAV si la T1 confirma que iCloud lo acepta; si no, `PUT` en el destino y luego `DELETE` en el origen. Descartado: borrar primero (si el `PUT` falla, el evento desaparece de iCloud). Motivo: con el orden elegido, un fallo deja como mucho un duplicado en iCloud, que la siguiente actualización trae y el usuario ve. Una repetición sola no se mueve: CalDAV la guarda dentro de la serie, y se aplica RF-47. Cubre: RF-41, RF-47.
- D10: Un `fetch` propio para `tsdav` que solo acepta `https://caldav.icloud.com` y `https://p<número>-caldav.icloud.com`, sigue las redirecciones a mano dentro de esos hosts y manda la cabecera de autenticación solo a ellos. Descartado: el `fetch` por defecto, que seguiría cualquier `href` o redirección de la respuesta con la contraseña. Motivo: requisito "solo servidores de Apple" de la spec y protección SSRF, como `ip-guard` de la 004. Cubre: requisito de privacidad y seguridad.
- D11: Clasificación de errores de iCloud de la tabla de "Contratos", con `401` como permiso retirado. Descartado: tratar `401` como fallo temporal. Motivo: Apple revoca las contraseñas al cambiar la del Apple ID y no hay forma de renovarlas (RF-61). Cubre: RF-45 a RF-48, RF-61, RF-63.
- D12: Plazo común de 9 s para cada escritura, también para el descubrimiento previo, y 10 s para verificar al conectar. Descartado: un plazo por petición. Motivo: el mismo de la 009 (D12) y RF-46. Cubre: RF-8, RF-46.
- D13: El ritmo de actualización es el de Google (cada hora lo que tenga más de 5 horas) y se relee toda la ventana (plan 007 D7). Descartado: `sync-collection` con `sync-token`, que guarda estado por calendario y no quita lo que sale de la ventana. Motivo: RF-29, RF-32 y que Apple no publica límites: son unas 3 + N peticiones por cuenta y hora. Cubre: RF-29, RF-32, requisito de coste cero.
- D14: Si iCloud no permite `PROPPATCH displayname`, el nombre de un calendario de iCloud no se puede cambiar en CaFam (decisión del usuario del 2026-11-01), con una enmienda a RF-52. Descartado: cambiarlo solo en CaFam. Cubre: RF-52.
- D15: La contraseña se escribe en un formulario de CaFam y viaja solo a la Server Action, que no la registra ni la devuelve. Descartado: pedirla en un paso intermedio guardado en una cookie. Motivo: un solo envío y nada que limpiar. Cubre: RF-7, RF-12.

## Trazabilidad RF -> módulo

- RF-1 -> `/dashboard/connections`, `provider-labels`
- RF-2, RF-3 -> `icloud-notice`, `/connections/new?provider=icloud`
- RF-4 -> `icloud-notice` (enlace a `/privacy`)
- RF-5 -> `connectIcloud`, `icloud.verify`, `connect_account`, `connection-list`
- RF-6 -> `icloud` (`401` → `revoked`), `connectIcloud`, `error-messages`
- RF-7 -> `connectIcloud` (`values.appleId`, contraseña vacía), `icloud-connect-form`
- RF-8 -> `connectIcloud`, plazo de 10 s (D12), `error-messages`
- RF-9 -> `connect_account` (reemplaza el secreto), `connectIcloud`
- RF-10 -> único `(owner_id, provider, account_subject)` de la 007
- RF-11 -> `connect_account` (`CF429`, todas las conexiones), `connectIcloud`
- RF-12 -> D3, D15, `no-secrets.test.ts`
- RF-13 -> `icloud.listCalendars`, `providerCalendars`, `calendar-picker`
- RF-14 -> `icloud.listCalendars` (solo `VEVENT`)
- RF-15 -> `select_synced_calendars`, `nearest-color`
- RF-16 -> `detach_synced_calendars`, `calendar-picker` (007)
- RF-17 -> `providerCalendars` en cada visita
- RF-18 -> `select_synced_calendars`, `sync_attach_*` (`CF429`)
- RF-19 -> `icloud` (`404` → `missing`), `sync_fail('missing')`
- RF-20 -> D8, `sync_set_access`, `readOnlyReason`, `provider-labels`
- RF-21 -> `window`, `icloud.listEvents` (`time-range`)
- RF-22, RF-23 -> `icloud-ics.expandObject` (D5, D6)
- RF-24, RF-25 -> `icloud-ics.expandObject`, `buildRow`, `zonedLocalToUtc`, `summary`
- RF-26 -> `limit-events`, `summary`
- RF-27 -> spec 012 y 014 sin cambios (las imágenes y comentarios nunca pasan por el proveedor)
- RF-28 -> `RepeatField` con `readOnlyReason`/`synced` (como Google, spec 013), `provider-labels`
- RF-29 -> `sync_claim_due`, `pg_cron` (007), D13
- RF-30, RF-31 -> `syncNow`, `sync_claim_connection`, `sync-status`
- RF-32 -> `sync_apply_events`, D13
- RF-33 -> `sync-status`, ficha del calendario, `provider-labels`
- RF-34, RF-35 -> `sync_write_context`, `sync_commit_event`, `canWriteEvents`
- RF-36 -> `canWriteEvents`, `load-new-event`, `load-event`, ventana rápida
- RF-37 -> `write-event` (proveedor primero), `icloud.insertEvent/updateEvent/deleteEvent`
- RF-38 -> `icloud-ics.newEventIcs`, `patchIcs`
- RF-39 -> `icloud-ics.patchIcs`, D7
- RF-40 -> `icloud-ics.patchIcs`, `removeOccurrence`, D6
- RF-41 -> `icloud.moveEvent`, D9, `write-event`
- RF-42 -> `moveTargets`, `sync_write_context` (`22023`)
- RF-43 -> acciones de evento (`done`), avisos de la 008
- RF-44 -> `sync_apply_events` (no toca color ni categoría), `newEventIcs`/`patchIcs` (no los escriben)
- RF-45 -> `write-event`, acciones (`values`)
- RF-46 -> D12, `writeErrorText('transient', 'icloud')`
- RF-47 -> D11, `writeErrorText('rejected', 'icloud')`
- RF-48 -> `writeErrorText('gone', 'icloud')`, `sync_commit_event('gone')`
- RF-49 -> D7 (`If-Match` solo con el ETag recién leído)
- RF-50 -> `sync_apply_events` (`p_read_at`)
- RF-51 -> `write-errors`, `error-messages` (textos propios)
- RF-52 -> `icloud.renameCalendar`, `renameSyncedCalendar`, `sync_update_calendar`, D14
- RF-53 -> `sync_update_calendar` (color y descripción solo en CaFam)
- RF-54 -> `icloud.insertCalendar`, `createSyncedCalendar`, `sync_attach_created`, ficha de la cuenta
- RF-55 -> `upload-calendar`, `sync_attach_uploaded`, página `/upload`
- RF-56, RF-57 -> `upload-plan`, página `/upload`
- RF-58 -> `sync_attach_uploaded` (009, 012, 013 y 014 sin cambios)
- RF-59 -> `upload-calendar` (compensación con `icloud.deleteCalendar`)
- RF-60 -> `sync_attach_uploaded`, página `/upload`
- RF-61 -> D11, `sync_fail('revoked')`, `write-event`
- RF-62 -> `reconnect-notice`, `notice-list`, `new?provider=icloud&reconnect=`
- RF-63, RF-64 -> `sync_fail('transient')`, D11
- RF-65 -> `disconnect-dialog`, `disconnectAccount`
- RF-66 -> `disconnect_account` (borra el secreto de Vault)
- RF-67 -> `icloud.revoke` (nada), `disconnect-dialog`
- RF-68 -> D9 y D14 (nunca `DELETE` de colección salvo la compensación), `detach_synced_calendars`
- RF-69 -> `/privacy`
- RF-70 -> `canMerge`, `merge_calendars`, grupos y calendarios sin propietario de la 006 y la 007, sin cambios

## Comprobaciones de la T1

Antes de programar, con una cuenta real de iCloud del usuario y un script en el scratchpad que lee el Apple ID y la contraseña de `.env.local` (`ICLOUD_TEST_APPLE_ID`, `ICLOUD_TEST_APP_PASSWORD`, nunca en el chat ni en el repositorio). El usuario lo ejecuta con `!` y se anota aquí la salida sin credenciales:

- (a) Descubrimiento con `tsdav`: hosts por los que pasa (`caldav.icloud.com` → `pNN-caldav.icloud.com`) y redirecciones, para fijar la lista de D10.
- (b) La contraseña se acepta con guiones, sin guiones y con espacios (normalización de `icloud-credentials`).
- (c) `PROPFIND` de la colección: `calendar-color`, `supported-calendar-component-set` (separa Recordatorios) y `current-user-privilege-set`; si aparece un calendario compartido por otra persona y con qué privilegios (si no aparece, se acepta, decisión del 2026-11-01).
- (d) `calendar-query` con `time-range` devuelve las series que empiezan antes de la ventana y tienen repeticiones dentro.
- (e) `PUT` de un evento nuevo, `PUT If-Match` de un cambio (con una alarma puesta en el iPhone que debe seguir ahí), cambio y borrado de una repetición, `DELETE`.
- (f) `MOVE` entre dos calendarios de la cuenta (D9).
- (g) `MKCALENDAR`, `PROPPATCH displayname` (D14) y `DELETE` de la colección creada.
- (h) Respuesta a una contraseña revocada (`401` esperado).
- (i) Número de peticiones y duración de una actualización de un calendario real, para el riesgo R2.

Si algo de (e) a (g) no funciona como se espera, se vuelve al usuario antes de la T2.

## Pasos de producción (los ejecuta el usuario)

1. Migración a prod: `npx supabase link --project-ref yznbdoskvtxeasujtirk`, `npx supabase db push` y `npx supabase link --project-ref uthubyzhonrtrmbcqcjh` (volver a dev). Aplica `icloud_provider`.
2. Desplegar: `git push origin 018-sincronizacion-icloud` y después `git checkout main && git merge --ff-only 018-sincronizacion-icloud && git push origin main`. La migración va antes que el despliegue.

Sin variables nuevas en Vercel, sin secretos nuevos en Vault y sin registrar nada en Apple.

## Riesgos y mitigaciones

- R1: La contraseña específica de app da acceso a correo y contactos; una fuga de Vault o de los registros sería grave. Mitigación: solo en Vault, leída con el secreto del servidor; nunca en `FormState`, registros ni errores (los `ProviderError` no copian cabeceras); `fetch` limitado a los hosts de Apple (D10); test de que `connectIcloud` no devuelve la contraseña; la spec lo avisa (RF-3).
- R2: Apple limita las peticiones sin publicar el límite. Mitigación: ritmo de Google (D13), 4 calendarios en paralelo como máximo, `429` y `503` como temporales (RF-63) y la medida (i) de la T1.
- R3: Apple cambia el comportamiento de CalDAV sin aviso. Mitigación: los fallos se tratan como temporales o rechazos sin perder datos (RF-45, RF-63), tests con respuestas sintéticas por cada caso y la demo de la spec en producción.
- R4: Una serie de iCloud con miles de repeticiones o un `RRULE` raro agota el tiempo. Mitigación: la expansión se corta al final de la ventana y al tope de lectura de la 007 (10.000), como `parse-ics`.
- R5: Mover con `PUT` + `DELETE` (si no hay `MOVE`) puede dejar un duplicado en iCloud si falla el `DELETE`. Mitigación: D9; la siguiente actualización trae el duplicado y el usuario lo ve y lo borra.
- R6: El formulario de conexión podría usarse para probar contraseñas de otra cuenta. Mitigación: las contraseñas específicas de app son de 16 letras aleatorias (inviables de adivinar) y Apple bloquea los intentos fallidos; no se añade un límite propio.
- R7: El cambio de "Google" por el nombre del proveedor toca muchos textos ya probados (unos 100). Mitigación: se hace en una tarea propia, con `provider-labels` y los tests actuales en verde antes de añadir iCloud.
- R8: Un evento borrado en CaFam durante una actualización puede reaparecer hasta la siguiente (plan 009 R9). No cambia con iCloud.

## Dudas abiertas

- Ninguna que bloquee: lo que falta por confirmar está en "Comprobaciones de la T1" y su resultado se anota aquí antes de la T2. Si la T1 confirma que iCloud no deja renombrar (g), se enmienda RF-52 según la decisión del usuario del 2026-11-01 (D14).
