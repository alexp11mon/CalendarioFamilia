# Plan 014 — Comentarios en los eventos

Spec de origen: `specs/014-comentarios-en-eventos/spec.md` (aprobada el 2026-10-29). Plan aprobado el 2026-10-31. Constitución: `docs/constitution.md`. Sin dependencias nuevas.

## Resumen de arquitectura

- **Datos:** una tabla nueva `event_comments` con RLS. Leen los miembros del calendario del evento (Lectores incluidos), escribe cualquier miembro como autor de su comentario, edita solo el autor y borran el autor o el propietario. Todo lo impone la base de datos (P3). El evento es la frontera: borrar el evento borra sus comentarios en cascada, y mover o juntar el evento no los toca.
- **Lectura y escritura:** Server Actions con la sesión del usuario: `loadComments` (página de 50), `addComment`, `editComment` y `deleteComment`. La sección "Comentarios" del detalle es un Client Component que carga los comentarios **después** de abrir el detalle, con su esqueleto, así que no lo retrasa. Mientras está abierta vuelve a pedirlos cada 20 s si la pestaña está visible.
- **Repeticiones (spec 013):** un comentario siempre va en la fila de un evento. Comentar una repetición sin fila la materializa antes con `materialize_occurrence`, igual que la primera imagen.

```
EventDetail ──▶ EventComments (cliente) ── al montar ──▶ loadComments(eventId) ──▶ event_comments (RLS: miembro)
     │                │                                   + calendar_members_with_names → authorLabel
     │                ├── cada 20 s con la pestaña visible ─▶ loadComments(eventId, { since: más antiguo cargado })
     │                ├── "Ver anteriores" ─▶ loadComments(eventId, { before: cursor })
     │                ├── CommentForm ─▶ addComment(eventId, body, clientId) ─▶ [materialize_occurrence] ─▶ insert (RLS)
     │                └── CommentItem ─▶ editComment / deleteComment (ConfirmDialog) ─▶ update(body) / delete (RLS)
getEventsInRange ── event_comments(count) ──▶ EventBlock (icono + número)
```

## Módulos y responsabilidades

| Módulo | Archivos | Qué hace | Qué no hace | RF |
|--------|----------|----------|-------------|----|
| `comments-schema` | `supabase/migrations/<ts>_event_comments.sql` | Tabla `event_comments`, índices, RLS, permiso por columna (`update (body)`), trigger `event_comments_rules` (normaliza y valida el texto, pone `edited_at` y rechaza comentarios en la fila de una serie) | No decide la interfaz | RF-9, RF-10, RF-13, RF-14, RF-16, RF-17, RF-18, RF-19, RF-22, RF-23, RF-24, RF-26, RF-28 |
| `comments-copy` | `supabase/migrations/<ts>_comments_copy_loss.sql` | `create or replace` de `copy_calendar_for_owner` (última versión, en `series_copy_upload`) para copiar los comentarios con su autor, sus fechas y su marca de editado; y de `series_loss` para contar también los comentarios que se perderían | No cambia el resto de la copia ni de la regla de pérdidas | RF-27, RF-28 |
| `comments-core` | `src/lib/comments/limits.ts`, `schemas.ts`, `linkify.ts`, `relative-time.ts`, `error-messages.ts` | Lógica pura: límites (1.000 caracteres, páginas de 50, sondeo cada 20 s); esquema `zod` del texto (recorta los extremos y conserva los saltos de línea); `linkify(text)` parte el texto en trozos `text`/`link` (solo `https://`); `relativeTime(date, now, tz)` da "hace 5 min" o "ayer a las 18:30", y `fullDateTime` la fecha completa; traduce SQLSTATE y RLS a español | No toca la red ni el DOM | RF-2, RF-9, RF-10, RF-11, RF-12, casos límite |
| `comments-queries` | `src/lib/comments/queries.ts` | `listComments(supabase, eventId, { before?, since? })`: comentarios en orden cronológico con autor (`authorLabel`, spec 006), avatar, texto, fechas, "editado", si quien mira puede editar o borrar, y si hay anteriores. Resuelve el id de una repetición (`parseEventId`) a su excepción, o a "sin comentarios" si no tiene fila | No escribe | RF-1, RF-2, RF-3, RF-4, RF-6, RF-16, RF-17, RF-21, RF-24, RF-28 |
| `comments-actions` | `src/app/dashboard/events/comment-actions.ts` | Server Actions `loadComments`, `addComment` (materializa la repetición si hace falta y guarda el comentario sin duplicarlo), `editComment` y `deleteComment`. Validan con `zod`, explican el fallo ("Ya no tienes acceso", "Este evento ya no existe") y devuelven la lista o el error sin redirigir | No hacen `revalidatePath` (la sección se refresca sola) salvo para el número de las vistas | RF-7, RF-8, RF-10, RF-12, RF-13, RF-14, RF-15, RF-16, RF-17, RF-28, casos límite |
| `comments-ui` | `src/components/comments/event-comments.tsx`, `comment-item.tsx`, `comment-form.tsx`, `comment-text.tsx`, `comments-skeleton.tsx` | Sección "Comentarios" del detalle (ventana y página completa): lista con avatar, nombre, texto (`whitespace-pre-wrap`, enlaces con `target="_blank" rel="noopener noreferrer"`), `<time>` relativa con la fecha completa, "(editado)", "Ver anteriores", formulario "Comentar", edición en línea, borrar con `ConfirmDialog`, sondeo y región `aria-live` que anuncia los comentarios nuevos sin mover el foco | No decide permisos (los recibe de la consulta) | RF-1, RF-2, RF-4, RF-6, RF-7, RF-8, RF-10, RF-11, RF-12, RF-14, RF-15, RF-20, RF-21 |
| `comments-marks` | `src/lib/calendar/queries.ts` (`getEventsInRange`), `to-view-events.ts`, `components/calendar/event-block.tsx`, `components/shell/icons.tsx` (`CommentIcon`) | `commentCount` en los eventos de las vistas (`event_comments(count)`), icono con el número en la agenda y, con las reglas de cabida de la 012 y la 013, en mes, semana y día, con "N comentarios" para lectores de pantalla | — | RF-5 |
| `validation` | `tests/integration/event-comments.test.ts`, capturas, prueba con dos usuarios | Matriz de permisos por rol (propietario, Editor, Lector, ajeno, expulsado, sin propietario), ciclo de vida (borrar, sincronizar, mover, juntar, copiar, duplicar, repeticiones), capturas y prueba manual | — | todos |

## Modelo de datos

### `public.event_comments`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` PK `default gen_random_uuid()` | |
| `event_id` | `uuid not null references events (id) on delete cascade` | Índice `(event_id, created_at, id)`. La cascada cubre RF-18, RF-19 y la serie borrada con sus excepciones |
| `author_id` | `uuid references profiles (id) on delete set null` | `default auth.uid()`. Nulo = "Cuenta borrada"; fuera del calendario = "un antiguo miembro" (RF-3). Índice |
| `client_id` | `uuid not null` | Lo genera el formulario en cada envío. `unique (author_id, client_id)`: una doble pulsación o un reintento no duplica (caso límite) |
| `body` | `text not null` | `check (char_length(body) between 1 and 1000)`. El trigger recorta los espacios de los extremos (no los saltos interiores) antes del `check` (RF-9) |
| `created_at` | `timestamptz not null default now()` | |
| `edited_at` | `timestamptz` | Nulo = sin editar. Lo pone el trigger cuando cambia `body` (RF-4) |

- **RLS:**
  - `select`: `exists (select 1 from events e where e.id = event_id and is_calendar_member(e.calendar_id))`. Un expulsado deja de verlos y sus comentarios se quedan (RF-22, RF-23).
  - `insert`: `author_id = auth.uid()` y miembro del calendario del evento, con cualquier rol (RF-7). Sin mirar si el calendario es traído (RF-13).
  - `update`: solo `author_id = auth.uid()` y miembro (RF-14, RF-17). Permiso por columna: `grant update (body)`; el resto lo rechaza con `42501`.
  - `delete`: autor y miembro, o `calendar_role_for(calendar del evento) = 'owner'` (RF-15, RF-16). Un calendario sin propietario no tiene fila `owner`: nadie borra lo ajeno (caso límite).
  - `anon` no ve nada.
- **Trigger `event_comments_rules` (before insert or update):** `body := btrim(body, espacios)`, `22023` si el evento es la fila de una serie (`recurrence is not null`: el comentario va en la repetición, RF-28), `edited_at := now()` si cambia `body` en un `update`, y no deja cambiar `event_id` ni `author_id` (se protegen además con el permiso por columna).
- **No se guarda ningún email:** el nombre sale de `calendar_members_with_names` (RF-24).
- **`series_loss`** devuelve además `comments int`: los comentarios de las excepciones que se perderían.

## Contratos e interfaces

### Server Actions (`comment-actions.ts`)

```ts
type CommentView = {
  id: string;
  author: string;          // nombre, "Cuenta borrada" o "un antiguo miembro"
  authorId: string | null; // para el tinte del avatar
  body: string;
  createdAt: string;       // ISO
  edited: boolean;
  canEdit: boolean;        // es el autor
  canDelete: boolean;      // autor o propietario
};
type CommentPage = { comments: CommentView[]; hasOlder: boolean };
type CommentResult =
  | { ok: true; page: CommentPage }
  | { ok: false; error: string; gone?: true; fieldError?: string };

loadComments(eventId: string, opts?: { before?: string; since?: string }): Promise<CommentResult>
addComment(eventId: string, body: string, clientId: string): Promise<CommentResult>
editComment(eventId: string, commentId: string, body: string): Promise<CommentResult>
deleteComment(eventId: string, commentId: string): Promise<CommentResult>
```

- `eventId` admite el id de una repetición (`<uuid>_<fecha>`); se valida con `parseEventId`, nunca con `z.uuid()`.
- `before` (cursor `created_at|id`) trae los 50 anteriores (RF-6); `since` trae todo desde el comentario más antiguo cargado, para que el sondeo vea también lo editado y lo borrado (RF-20, RF-21). Sin opciones: los 50 más recientes.
- Las escrituras devuelven la lista actualizada (como `since`), así no hay que esperar al sondeo (RF-8).
- Errores: texto vacío o largo → `fieldError` (RF-10); evento que ya no existe → `gone: true` y "Este evento ya no existe" (el detalle cierra como `GoneEvent`); calendario que ya no se ve → "Ya no tienes acceso"; red → "No se ha podido conectar…" (RF-12, casos límite). `23505` en `(author_id, client_id)` cuenta como éxito.

### Componentes

- `EventComments({ eventId, timeZone })`: dentro de `EventDetail`, después de las imágenes, en la ventana y en la página completa.
- `CommentForm`: `TextArea` con etiqueta visible "Escribe un comentario", contador al acercarse a 1.000, error enlazado con `aria-describedby`, botón "Comentar" (`min-h-11`). Enviar con el botón; en el escritorio también con Ctrl/⌘+Intro. Si falla, el texto se queda (RF-12).
- `CommentItem`: avatar (`Avatar`), nombre, `<time dateTime title>` con la fecha relativa y la completa en `title` y en el texto para lectores de pantalla, "(editado)" y, según permisos, "Editar" y "Borrar".
- `CommentText({ text })`: pinta los trozos de `linkify` como nodos de texto y `<a>`. Nunca `dangerouslySetInnerHTML` (RF-11).

### SQL

- `series_loss(p_series_id, p_from, p_only) returns table (exceptions int, images int, comments int)`. `lossText` añade "y N comentarios".

## Flujo principal paso a paso

1. Un Lector abre el detalle de un evento (ventana o página). El detalle se pinta como hoy; la sección "Comentarios" muestra su esqueleto y llama a `loadComments` (RF-1, rendimiento).
2. `listComments` lee los 50 más recientes con RLS (RF-22), los nombres con `calendar_members_with_names` y calcula autor, "(editado)" y permisos (RF-2, RF-3, RF-4, RF-16, RF-17, RF-24). La interfaz los pone en orden cronológico y, si hay más, "Ver anteriores" (RF-6).
3. El Lector escribe y pulsa "Comentar" (RF-7). El cliente valida el largo (RF-10) y llama a `addComment` con un `client_id` nuevo. Si el id es de una repetición sin fila, la acción comprueba la fecha con `findOccurrence` y llama a `materialize_occurrence` (RF-28). Inserta con RLS (RF-13 incluido).
4. La acción devuelve la lista; el comentario aparece al final y el campo se vacía (RF-8). Si falla, el texto se queda y se ve el error (RF-12).
5. Otra persona con el detalle abierto lo ve en el siguiente sondeo, como mucho 20 s después; la región `aria-live` lo anuncia (RF-20, accesibilidad). Una edición o un borrado se reflejan igual (RF-21).
6. El autor edita (RF-14) o borra tras confirmar (RF-15); el propietario puede borrar el de otro (RF-16). La base de datos rechaza lo demás (RF-17).
7. Las vistas muestran el icono con el número (`commentCount`) tras `router.refresh()` al cerrar el detalle (RF-5).

## Decisiones técnicas

- **D1: tabla propia con RLS y escrituras directas por PostgREST.** Descartadas las funciones `SECURITY DEFINER` para escribir. Motivo: las reglas (miembro, autor, propietario) caben en políticas, como en `event_images`, y la base de datos sigue siendo la frontera (P3). Cubre: RF-7, RF-14 a RF-17, RF-22.
- **D2: sondeo cada 20 s con una Server Action, solo con la pestaña visible.** Descartado Supabase Realtime (`postgres_changes`). Motivo: Realtime añade un canal por detalle, autorización propia y un servicio más que mantener dentro de la capa gratuita; 20 s cumple los 30 s de RF-20 y cada sondeo es una consulta indexada. Con el detalle abierto en una pestaña oculta no se pide nada, y al volver se pide al momento. Cubre: RF-20, RF-21, coste cero.
- **D3: el sondeo vuelve a pedir todo desde el comentario más antiguo cargado.** Descartado pedir solo lo nuevo (`created_at > último`). Motivo: así ve también lo editado y lo borrado sin tabla de cambios ni borrado lógico; son como mucho unos cientos de filas pequeñas. Cubre: RF-20, RF-21.
- **D4: los comentarios se cargan en el cliente después de abrir el detalle.** Descartado leerlos en `load-event.ts`. Motivo: el detalle no espera a los comentarios (requisito de rendimiento) y la misma acción sirve para la carga, el sondeo y "Ver anteriores". Cubre: RF-1, RF-6.
- **D5: un comentario en una repetición sin fila la materializa con `materialize_occurrence`.** Descartado guardar en el comentario la serie y la fecha de la repetición. Motivo: reutiliza el camino de las imágenes (spec 013, T14), que ya admite a los Lectores con el secreto, y así un comentario siempre cuelga de una fila de `events` con su cascada. El trigger rechaza comentarios en la fila de la serie. Cubre: RF-28.
- **D6: `series_loss` cuenta también los comentarios y el aviso de la 013 los nombra.** Descartado perderlos sin aviso al cambiar la regla de una serie. Motivo: una excepción materializada para comentar se borra igual que una con imágenes, y la 013 (RF-24b) ya pide confirmar esas pérdidas. Cubre: RF-28.
- **D7: el texto se guarda recortado por el trigger y se pinta con nodos de texto y `linkify`.** Descartado guardar HTML o Markdown y limpiarlo al pintar. Motivo: sin interpretar nada no hay inyección posible; el trigger garantiza la regla de RF-9 también fuera de la app. Cubre: RF-9, RF-11, seguridad.
- **D8: `client_id` único por autor para no duplicar.** Descartado desactivar el botón como única defensa. Motivo: un reintento tras un corte de red llega dos veces al servidor aunque el botón esté desactivado. Cubre: caso límite de doble envío.
- **D9: el autor por `author_id → profiles on delete set null` y el nombre por `authorLabel`.** Descartado guardar el nombre en el comentario. Motivo: es el patrón del autor del evento y de las imágenes (spec 006 y 012), y nunca expone el email. Cubre: RF-2, RF-3, RF-24.
- **D10: `copy_calendar_for_owner` copia los comentarios** con `author_id`, `created_at`, `edited_at` y un `client_id` nuevo. Descartado no copiarlos. Motivo: RF-27 lo pide. Cubre: RF-27.
- **D11: el número de comentarios en las vistas con `event_comments(count)` en `getEventsInRange`.** Descartado un contador en `events` mantenido por trigger. Motivo: es como `imageCount` (spec 012), no añade columnas que mantener y las repeticiones sin fila no tienen comentarios. Cubre: RF-5.

## Trazabilidad RF → módulo

| RF | Módulos |
|----|---------|
| RF-1 | comments-ui, comments-queries |
| RF-2 | comments-core (`relativeTime`), comments-queries, comments-ui |
| RF-3 | comments-queries (`authorLabel`), comments-schema (`on delete set null`) |
| RF-4 | comments-schema (`edited_at`), comments-ui |
| RF-5 | comments-marks |
| RF-6 | comments-queries (página de 50), comments-ui |
| RF-7 | comments-schema (política `insert`), comments-actions, comments-ui |
| RF-8 | comments-actions, comments-ui |
| RF-9 | comments-schema (trigger y `check`), comments-core (`schemas`) |
| RF-10 | comments-core, comments-actions, comments-ui |
| RF-11 | comments-core (`linkify`), comments-ui (`CommentText`) |
| RF-12 | comments-actions, comments-ui |
| RF-13 | comments-schema (sin condición de traído), comments-actions |
| RF-14 | comments-schema (`update (body)`), comments-actions, comments-ui |
| RF-15 | comments-schema (`delete`), comments-actions, comments-ui |
| RF-16 | comments-schema (`delete` del propietario), comments-queries (`canDelete`) |
| RF-17 | comments-schema (`update` solo del autor) |
| RF-18 | comments-schema (cascada) |
| RF-19 | comments-schema (cascada al borrar `sync_apply_events`) |
| RF-20 | comments-ui (sondeo), comments-actions |
| RF-21 | comments-ui, comments-queries (`since`) |
| RF-22 | comments-schema (política `select`) |
| RF-23 | comments-schema (`select` por pertenencia, sin cascada desde `calendar_members`) |
| RF-24 | comments-queries, comments-schema (sin email) |
| RF-25 | validation (duplicar no lee comentarios: `load-new-event` no cambia) |
| RF-26 | comments-schema (cuelgan del evento: mover y `merge_calendars` no los tocan) |
| RF-27 | comments-copy |
| RF-28 | comments-schema (trigger), comments-actions (materializar), comments-copy (`series_loss`) |

## Riesgos y mitigaciones

- **R1: muchos sondeos con detalles abiertos.** Mitigación: solo con la pestaña visible, una consulta indexada por `(event_id, created_at)`; el uso familiar queda lejos del límite de invocaciones de Vercel Hobby. Si un día preocupa, se sube el intervalo hasta 30 s sin cambiar ningún RF.
- **R2: Activity conserva la sección oculta y su temporizador** (trampa de la 008). Mitigación: el sondeo se para en la limpieza del efecto y depende de que la sección esté visible; el resultado de cada envío se atiende una sola vez.
- **R3: el sondeo pisa un comentario que se está editando.** Mitigación: la edición guarda su borrador en el estado local por `id`; si el comentario desaparece en un sondeo, la edición se cierra con el aviso "Este comentario ya no existe".
- **R4: una excepción materializada solo para comentar se pierde al cambiar la regla de la serie.** Mitigación: D6 (aviso y confirmación de la 013).
- **R5: subir a Google una serie** (spec 009/013) suelta las excepciones como eventos y borra la serie: los comentarios de las excepciones se conservan y la serie no tiene comentarios (trigger). Se comprueba en `test:db`.
- **R6: la política `select` hace un `exists` por fila.** Mitigación: índice por `event_id` y `is_calendar_member` ya es `SECURITY DEFINER` y estable; las listas son de 50.

## Dudas abiertas

- Ninguna.
