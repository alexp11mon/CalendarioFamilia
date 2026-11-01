# Tasks 018 - Sincronización con iCloud (calendarios del iPhone)

> Estado: **Aprobadas** por el usuario (2026-11-01). T2–T14 hechas; T1 a medias (`tsdav` instalada, falta la comprobación con una cuenta real) y T15 a medias (verificación en dev hecha, faltan producción, la demo en el iPhone y el cierre).
> Spec: `specs/018-sincronizacion-icloud/spec.md` (aprobada, 2026-11-01). Plan: `specs/018-sincronizacion-icloud/plan.md` (aprobado, 2026-11-01).
> 15 tareas en tres iteraciones: T1–T9 (comprobaciones, base y piezas de iCloud), T10–T14 (motor y pantallas) y T15 (validación). No se empieza una iteración sin cerrar la anterior.
> Reglas:
>
> - Una tarea cada vez, con el test primero (rojo → verde).
> - Al cerrar cada tarea se ejecuta y se reporta `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`. Si toca esquema, RLS o acceso a datos, también `npm run test:db -- <filtro>`.
> - Si toca interfaz: capturas a 390, 768 y 1440 px en los dos temas, con el acento rojo y el amarillo (P9).
> - Un commit por tarea, citándola, en la rama `018-sincronizacion-icloud`. El primer commit lleva `spec.md`, `plan.md`, `tasks.md` y la enmienda 6.
>
> Dependencia nueva (P6, aprobada en la spec): `tsdav@2.5.0` exacta, que se instala en la T1 y solo se importa en `src/lib/sync/providers/icloud.ts`. iCloud se sustituye en los tests por un `fetch` doble con respuestas sintéticas en `tests/fixtures/sync/icloud/` (XML de CalDAV y `.ics`), nunca calendarios ni credenciales reales.
> Migraciones: solo nuevas, con `npm run db:push` (dev) y `npm run db:types`. Producción la aplica el usuario (plan, "Pasos de producción").

## Tareas

### Iteración 1 — Comprobaciones, base y piezas de iCloud

- [ ] T1 Instalar `tsdav` y comprobar con una cuenta real lo que el plan da por supuesto
  Pasos: `npm install --save-exact tsdav@2.5.0`. El usuario crea una contraseña específica de app y la pone en `.env.local` (`ICLOUD_TEST_APPLE_ID`, `ICLOUD_TEST_APP_PASSWORD`; nunca en el chat). El agente escribe en el scratchpad un script que hace las comprobaciones (a) a (i) del plan sin imprimir credenciales; el usuario lo ejecuta con `!`. Se borran después del iCloud real los eventos y el calendario de prueba creados.
  Hecho cuando: `package.json` tiene `"tsdav": "2.5.0"`, `npm run build` en verde y "Resultado de la T1" del plan anota (a) a (i). Si (e), (f) o (g) no funcionan como espera el plan, se detiene y se vuelve al usuario (D9, D14). Cubre: RF-14, RF-20, RF-41, RF-52, RF-61, requisito de coste cero | Módulo: comprobación

- [x] T2 Admitir `icloud` como proveedor en la base de datos
  Pasos: test primero en `tests/integration/sync-icloud-schema.test.ts`: `connect_account` con `p_provider = 'icloud'` crea la conexión con `can_write`, guarda la credencial en Vault y la lee `sync_get_token` con el secreto; repetirla reemplaza la credencial sin duplicar; la sexta cuenta, sumando Google e iCloud, da `CF429`; `select_synced_calendars` acepta calendarios de iCloud con `access`; `list_tables_without_rls()` sigue vacía. Migración `icloud_provider`.
  Hecho cuando: `npm run test:db -- sync-icloud-schema sync-connect sync-schema sync-write` en verde y `src/types/database.ts` regenerado. Cubre: RF-5, RF-9, RF-10, RF-11, RF-18 | Módulo: SQL `icloud_provider`

- [x] T3 Separar la interfaz de proveedor y adaptar Google sin cambiar su comportamiento
  Pasos: test primero en `tests/unit/sync-providers.test.ts` (`providerFor('google')` y `providerFor('icloud')`, error con uno desconocido). `providers/types.ts` con `SyncProvider`, `ProviderError` y `FailureKind` (reexportados desde `google.ts`); `providers/index.ts`; `google.ts` implementa la interfaz.
  Hecho cuando: `npm test -- sync-providers provider-google run-sync write-event upload-calendar write-calendar` en verde sin cambiar ninguna aserción de los tests existentes. Cubre: RF-29 a RF-60 (base) | Módulo: `providers/types`, `providers/index`, `providers/google`

- [x] T4 Dar a los textos de sincronización el nombre del proveedor
  Pasos: test primero en `tests/unit/provider-labels.test.ts` y ampliación de `write-errors` y `read-only`: `writeErrorText(failure, provider)` da los textos de la 009 con `google` y los de iCloud del plan con `icloud`; `readOnlyReason` devuelve `provider`. Se cambian los componentes y páginas que dicen "Google" para que usen `provider-labels` (plan R7).
  Hecho cuando: `npm test` completo en verde y `grep` de "Google" en `src/components` y `src/app/dashboard` solo deja textos propios de Google (aviso previo de OAuth y botón "Conectar Google"). Cubre: RF-1, RF-20, RF-33, RF-43, RF-46, RF-47, RF-48, RF-51, RF-62 | Módulo: `provider-labels`, `write-errors`, `read-only`

- [x] T5 Validar y normalizar la credencial de iCloud
  Pasos: test primero en `tests/unit/icloud-credentials.test.ts`: el Apple ID se pasa a minúsculas sin espacios y acepta correos que no son de iCloud; la contraseña acepta guiones y espacios según el resultado de la T1 (b); un Apple ID que no es un correo o una contraseña vacía dan el error en español del campo; la credencial se serializa a `{"v":1,"username","password"}` y se lee de vuelta.
  Hecho cuando: `npm test -- icloud-credentials sync-schemas` en verde. Cubre: RF-5, RF-6, RF-7, casos límite de formato | Módulo: `icloud-credentials`, `schemas`, `error-messages`

- [x] T6 Convertir los recursos `.ics` de iCloud en eventos de CaFam
  Pasos: test primero en `tests/unit/icloud-ics-read.test.ts` con fixtures sintéticas: evento suelto con hora y de día completo, serie con `EXDATE` y una repetición modificada, serie que empieza antes de la ventana, evento cancelado, zona no reconocida y fin antes del inicio. `icloud-ics.ts` con `expandObject` (D5, D6); se añade a la lista de `ical.js` permitida en `no-secrets.test.ts`.
  Hecho cuando: `npm test -- icloud-ics-read no-secrets` en verde, con `external_id` `href` y `href#<RECURRENCE-ID>` comprobados. Cubre: RF-21, RF-22, RF-23, RF-24, RF-25 | Módulo: `icloud-ics`

- [x] T7 Escribir y modificar recursos `.ics` conservando lo que CaFam no muestra
  Pasos: test primero en `tests/unit/icloud-ics-write.test.ts`: `newEventIcs` (con hora en UTC y día completo con fin exclusivo); `patchIcs` cambia solo los campos dados y conserva `VALARM`, `ATTENDEE`, `URL`, `ATTACH` y propiedades desconocidas; en una repetición crea o actualiza su `VEVENT` con `RECURRENCE-ID`; `removeOccurrence` añade `EXDATE` y quita la excepción; nunca escribe color ni categoría.
  Hecho cuando: `npm test -- icloud-ics-write` en verde, y cada `.ics` producido se vuelve a leer con `expandObject` con el resultado esperado. Cubre: RF-38, RF-39, RF-40, RF-44 | Módulo: `icloud-ics`

- [x] T8 Leer de iCloud: descubrimiento, calendarios, eventos y errores
  Pasos: test primero en `tests/unit/provider-icloud-read.test.ts` con un `fetch` doble y XML sintéticos: el `fetch` propio rechaza hosts que no son de iCloud y no sigue redirecciones fuera de ellos (D10); descubrimiento hasta `calendar-home-set`; `listCalendars` con nombre, color y `owner | writer | reader`, sin las listas de Recordatorios; `listEvents` con `time-range`; `verify`; errores de la tabla del plan (`401` → `revoked`, `404` → `missing`, `429` y plazo → `transient`, `403` → `rejected`).
  Hecho cuando: `npm test -- provider-icloud-read` en verde. Cubre: RF-5, RF-6, RF-8, RF-13, RF-14, RF-17, RF-19, RF-20, RF-21, RF-61, RF-63 | Módulo: `providers/icloud`

- [x] T9 Escribir en iCloud: eventos y calendarios
  Pasos: test primero en `tests/unit/provider-icloud-write.test.ts`: `insertEvent` con `If-None-Match: *`; `updateEvent` con `GET` y `PUT If-Match`, un `412` reintenta una vez y el segundo da `rejected`; `deleteEvent` de un suelto y de una repetición; `moveEvent` según la T1 (D9) y `rejected` para una repetición; `insertCalendar` con `MKCALENDAR`; `renameCalendar` con `PROPPATCH` o rechazo según la T1 (D14); `deleteCalendar`; `revoke` no hace ninguna petición; el plazo de 9 s da `transient`.
  Hecho cuando: `npm test -- provider-icloud-write` en verde. Cubre: RF-37, RF-41, RF-45, RF-47, RF-48, RF-49, RF-52, RF-54, RF-59, RF-67 | Módulo: `providers/icloud`

### Iteración 2 — Motor y pantallas

- [x] T10 Sincronizar calendarios de iCloud con el motor de la 007
  Pasos: test primero ampliando `tests/unit/run-sync.test.ts` y `engine.test.ts`: un calendario `icloud` se lee con la credencial de Vault (sin renovar token), se aplica con `sync_apply_events` y `p_read_at`; un `401` llama a `sync_fail('revoked')`; Google sigue igual; `providerCalendars` guarda el permiso con `sync_set_access`; `revokeConnection` de iCloud no hace peticiones.
  Hecho cuando: `npm test -- run-sync engine` y `npm run test:db -- sync-worker` en verde. Cubre: RF-15, RF-26, RF-29, RF-30, RF-31, RF-32, RF-50, RF-61, RF-63, RF-64 | Módulo: `run-sync`, `engine`

- [x] T11 Escribir eventos, renombrar, crear y subir calendarios de iCloud desde las acciones
  Pasos: test primero ampliando `write-event.test.ts`, `write-calendar.test.ts` y `upload-calendar.test.ts` con un proveedor iCloud doble: crear, cambiar, cambiar una repetición, mover y borrar llaman al proveedor y después a `sync_commit_event`; un fallo no guarda nada; `gone` quita el evento; la subida compensa con `deleteCalendar`; renombrar sigue D14.
  Hecho cuando: `npm test -- write-event write-calendar upload-calendar event-actions calendar-actions` en verde. Cubre: RF-34, RF-35, RF-36, RF-37, RF-41, RF-42, RF-45, RF-48, RF-52, RF-53, RF-54, RF-55, RF-56, RF-57, RF-58, RF-59, RF-60 | Módulo: `write-event`, `write-calendar`, `upload-calendar`

- [x] T12 Conectar una cuenta de iCloud
  Pasos: test primero en `tests/unit/icloud-connect.test.tsx` (aviso con los pasos, el alcance de la contraseña y el enlace a `/privacy`; formulario con etiquetas; error que conserva el Apple ID y vacía la contraseña) y `tests/unit/connect-icloud-action.test.ts` (acción con `verify` doble: éxito redirige a la ficha, `401`, sin respuesta, límite de 5, `reconnect` reutiliza la conexión y la contraseña nunca aparece en el estado devuelto). Botón "Conectar iCloud" en `/dashboard/connections`.
  Hecho cuando: `npm test -- icloud-connect connect-icloud-action connection-list` en verde y capturas de la página a 390, 768 y 1440 px en los dos temas. Cubre: RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7, RF-8, RF-9, RF-11, RF-12 | Módulo: `icloud-notice`, `icloud-connect-form`, `connectIcloud`

- [x] T13 Adaptar la ficha de la cuenta, los avisos, la desconexión y la subida a iCloud
  Pasos: test primero ampliando los tests de `calendar-picker`, `reconnect-notice`, `notice-list`, `disconnect-dialog` y `upload-form`: "Solo lectura en iCloud"; aviso de contraseña no válida con "Volver a conectar" a `new?provider=icloud&reconnect=<id>`; el diálogo de desconexión recuerda revocar la contraseña en Apple; la subida ofrece las cuentas de iCloud con escritura; el nombre de un calendario de iCloud se deshabilita con su motivo si la T1 lo exige (D14); "Repetir" deshabilitado en calendarios de iCloud.
  Hecho cuando: `npm test -- calendar-picker reconnect-notice notice-list disconnect-dialog upload-form repeat-field calendar-form` en verde y capturas de la ficha y del diálogo a 390, 768 y 1440 px en los dos temas. Cubre: RF-13, RF-16, RF-18, RF-20, RF-27, RF-28, RF-33, RF-62, RF-65, RF-66, RF-67, RF-68, RF-70 | Módulo: ficha de la cuenta, `reconnect-notice`, `notice-list`, `disconnect-dialog`, `upload-form`

- [x] T14 Explicar iCloud en la política de privacidad y blindar la contraseña
  Pasos: test primero ampliando `privacy.test.tsx` (sección de iCloud: qué se lee y escribe, dónde se guarda la contraseña, con quién se comparte y cómo revocarla) y `no-secrets.test.ts` (ningún componente `"use client"` importa `tsdav` ni `providers/icloud`; `tsdav` solo se importa en `providers/icloud.ts`).
  Hecho cuando: `npm test -- privacy no-secrets` en verde. Cubre: RF-12, RF-69, requisito de privacidad y seguridad | Módulo: `/privacy`, `no-secrets`

### Iteración 3 — Validación

- [ ] T15 Validar la spec en dev y en producción y cerrarla
  Pasos: verificación completa de P8 (`typecheck`, `lint`, `format:check`, `test`, `build`, `test:db`); demo en dev con la cuenta de la T1; el usuario aplica la migración a prod y despliega (plan, "Pasos de producción"); demo de los criterios de finalización de la spec en producción con un iPhone; tabla RF → test en "Evidencias"; actualizar `AGENTS.md`.
  Hecho cuando: la verificación completa en verde con su salida reportada, la demo de producción anotada sin credenciales y el usuario aprueba cerrar la spec. Cubre: todos | Módulo: validación

## Evidencias

Verificación completa (P8) del 2026-11-01 en la rama, tras la T14:

- `npm run typecheck`, `npm run format:check` y `npm run build`: en verde.
- `npm run lint`: 0 errores y los 2 avisos anteriores a la spec (`event-form.tsx`, `event-images.test.ts`).
- `npm test`: 217 archivos, 2.067 tests en verde.
- `npm run test:db`: 37 de 41 archivos en verde en la primera pasada; los 4 restantes (`login`, `account-notices-read`, `account-orphan-permissions`, `profile-last-view`) fallaron por `Request rate limit reached` de Supabase Auth (trampa conocida) y en la repetición con `--no-file-parallelism` dieron 4 archivos y 14 tests en verde.
- Capturas de `/dashboard/connections/new?provider=icloud` y `/dashboard/connections` a 390, 768 y 1440 px, en tema claro y oscuro, con el acento rojo: sin desbordes ni colores fuera de los tokens.
- Prueba contra el iCloud real con un Apple ID inventado y una contraseña con forma válida: iCloud responde 401, la pantalla muestra "iCloud no ha aceptado el Apple ID o la contraseña…", conserva el Apple ID y vacía la contraseña (RF-6, RF-7).

Pendiente: la comprobación (a)–(i) con una cuenta real (T1), la migración en producción, la demo en el iPhone y la aprobación del cierre (T15).

## Trazabilidad RF -> Tareas

| RF | Tareas |
|----|--------|
| RF-1 | T4, T12 |
| RF-2, RF-3, RF-4 | T12 |
| RF-5 | T2, T5, T8, T12 |
| RF-6, RF-7 | T5, T8, T12 |
| RF-8 | T8, T12 |
| RF-9 | T2, T12 |
| RF-10 | T2 |
| RF-11 | T2, T12 |
| RF-12 | T12, T14 |
| RF-13 | T8, T13 |
| RF-14 | T1, T8 |
| RF-15 | T10 |
| RF-16 | T13 |
| RF-17 | T8 |
| RF-18 | T2, T13 |
| RF-19 | T8 |
| RF-20 | T1, T4, T8, T13 |
| RF-21 | T6, T8 |
| RF-22, RF-23, RF-24, RF-25 | T6 |
| RF-26 | T10 |
| RF-27, RF-28 | T13 |
| RF-29, RF-30, RF-31, RF-32 | T3, T10 |
| RF-33 | T4, T13 |
| RF-34, RF-35, RF-36 | T11 |
| RF-37 | T9, T11 |
| RF-38, RF-39, RF-40 | T7 |
| RF-41 | T1, T9, T11 |
| RF-42 | T11 |
| RF-43 | T4 |
| RF-44 | T7 |
| RF-45 | T9, T11 |
| RF-46 | T4 |
| RF-47 | T4, T9 |
| RF-48 | T4, T9, T11 |
| RF-49 | T9 |
| RF-50 | T10 |
| RF-51 | T4 |
| RF-52 | T1, T9, T11 |
| RF-53 | T11 |
| RF-54, RF-59 | T9, T11 |
| RF-55, RF-56, RF-57, RF-58, RF-60 | T11 |
| RF-61 | T1, T8, T10 |
| RF-62 | T4, T13 |
| RF-63 | T8, T10 |
| RF-64 | T10 |
| RF-65, RF-66, RF-68, RF-70 | T13 |
| RF-67 | T9, T13 |
| RF-69 | T14 |
| Todos | T15 |

## Dudas abiertas

- Ninguna que bloquee. La T1 puede cambiar el camino de T9 y T13 (mover con `MOVE` o con `PUT` + `DELETE`, y si se puede renombrar); las dos opciones ya están decididas en el plan (D9, D14).
