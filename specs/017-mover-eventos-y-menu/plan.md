# Plan 017 — Mover y redimensionar eventos, menú contextual y gestos

Spec de origen: `specs/017-mover-eventos-y-menu/spec.md` (aprobada el 2026-10-30). Plan aprobado el 2026-11-01. Constitución: `docs/constitution.md`, enmienda 5 ya incorporada. Sin dependencias nuevas (P6).

La spec se escribió antes de la 013 y dejó las repeticiones a "la 013 decide"; el plan de la 013 (R8) devolvió la decisión a esta spec. **Decisión del usuario (2026-11-01):** al soltar, cambiar el color o borrar (menú o Supr) una **repetición**, se pregunta el alcance con el diálogo de la 013 ("Solo este evento", "Este y los siguientes", "Todos los eventos"), como Google. Cancelar devuelve el evento a su sitio. "Deshacer" solo se ofrece con "Solo este evento"; con los otros alcances el aviso sale sin él. Pegar una repetición crea un evento suelto, como duplicarla. No cambia ningún RF: completa el caso límite que la spec dejó abierto.

## Resumen de arquitectura

- **Cliente:** las vistas semana, día y mes envuelven cada bloque editable en un `DraggableEvent` que atiende el puntero (ratón al momento, dedo tras 500 ms), el clic derecho y el teclado. El cálculo de dónde cae el evento es **lógica pura** (`lib/calendar/drag.ts`), testeada sin DOM. Durante el arrastre el bloque se mueve con `transform` en `requestAnimationFrame` y solo se vuelve a pintar con React al cambiar de cuarto de hora (rendimiento). Al soltar, el `CalendarWorkspace` aplica el cambio en pantalla (optimista), llama a la acción y, si falla, lo devuelve a su sitio con aviso.
- **Servidor:** una Server Action nueva, `quickChange`, cambia solo horas o color reutilizando los caminos que ya existen (`updateSingle` con Google primero para los traídos; `changeOccurrence` con el alcance para las repeticiones). `pasteEvent` crea la copia como `createEvent`. `deleteForUndo` guarda antes una **instantánea** del evento y borra por el camino de siempre; `undoAction` la restaura.
- **Deshacer:** el aviso (`ToastProvider`) admite una acción "Deshacer" de 10 s. El "token" de deshacer vive solo en memoria del cliente: solo la última acción, y se pierde al cerrar la app (casos límite). Los movimientos se deshacen escribiendo los valores anteriores si el evento no cambió entretanto (`updated_at`); los borrados, con la instantánea de la tabla `event_trash`.
- **Hoja, pellizco y atajos:** la ventana del detalle (`EventModal`) se pinta como hoja inferior en el móvil; la rejilla guarda la altura de la hora en estado (recordada en `localStorage`); los atajos nuevos se añaden a `lib/calendar/shortcuts.ts` con su tabla, que también pinta la ayuda "?".

```
DraggableEvent ─ puntero/teclado ─▶ useEventDrag ─▶ drag.ts (puro: dónde cae) ─▶ vista previa (transform + aria-live)
        │ soltar                                                                   
        ▼
CalendarWorkspace ─ optimista ─▶ [repetición → SeriesScopeChoice] ─▶ quickChange(id, cambio, scope?)
        │                                                                 ├ traído: writeEvent (Google primero)
        │                                                                 ├ repetición: changeOccurrence (update_occurrence / split / update_series)
        │                                                                 └ normal: update con RLS
        ├─ ok ─▶ useToast().show("Evento movido", { undo }) ─▶ "Deshacer" ─▶ undoAction(token)
        └─ error ─▶ revertir + aviso con el motivo (RF-4)

Menú contextual (EventMenu) ─▶ quickChange(color) · Duplicar (/events/new?from=) · deleteForUndo
deleteForUndo ─▶ snapshot_event (event_trash) ─▶ borrado de siempre (Google primero si es traído)
undoAction(borrado) ─▶ [traído: writeEvent create] ─▶ restore_event (fila, imágenes, comentarios, autor)
```

## Módulos y responsabilidades

| Módulo | Archivos | Qué hace | Qué no hace | RF |
|--------|----------|----------|-------------|----|
| `undo-schema` | `supabase/migrations/<ts>_event_undo.sql` | Tabla `event_trash` con RLS; funciones `snapshot_event` y `restore_event`; limpieza diaria con `pg_cron`; `images_claim_purge` no reclama en la purga general objetos encolados hace menos de 2 min | No decide la interfaz ni habla con Google | RF-25, RF-28, RF-29, RF-30 |
| `drag-core` | `src/lib/calendar/drag.ts` | Lógica pura: cuarto de hora bajo el puntero, mover conservando la duración, redimensionar con mínimo de 15 min, pasar a día completo y de día completo a 1 h, mover de día en mes y en la franja (conservando hora y número de días), sin cambio si cae en el mismo sitio, hora inexistente por el cambio de hora → primera válida (con `zonedLocalToUtc`), y el texto "jueves 12, 10:15–11:15" para la vista previa y los lectores de pantalla | No toca el DOM ni la red | RF-5, RF-7, RF-8, RF-10, RF-12 a RF-17, RF-19, RF-64, casos límite |
| `drag-hook` | `src/lib/hooks/use-event-drag.ts`, `src/components/calendar/draggable-event.tsx` | Gesto: umbral de 4 px con ratón, pulsación de 500 ms con el dedo (cancela si se mueve antes, RF-22), captura del puntero, `transform` en `requestAnimationFrame`, destino con `elementFromPoint` sobre `[data-day]`, `[data-allday-day]` y las celdas del mes, desplazamiento automático cerca de los bordes, Escape, tirador de fin (ratón: borde inferior; dedo: tirador visible al levantar), suprime el clic del enlace tras arrastrar y anuncia la hora en una región `aria-live` | No guarda nada | RF-2, RF-5 a RF-11, RF-16, RF-17, RF-20, RF-22, RF-23, accesibilidad, rendimiento |
| `quick-actions` | `src/app/dashboard/events/quick-actions.ts`; refactor de `actions.ts` | `quickChange(id, change, scope?, expected?)`: lee el evento con `getEvent`, arma `EventData` con los campos que no cambian y llama a `updateSingle` o `changeOccurrence` (este pasa a recibir `scope` como argumento, no solo del formulario). `pasteEvent(sourceId, target)`: copia sin imágenes ni comentarios, comprobando que se puede escribir en su calendario. `deleteForUndo(id, scope?)`: instantánea y borrado. `undoAction(token)`. Devuelven `QuickResult` sin redirigir y llaman a `revalidatePath` | No pinta nada | RF-1, RF-3, RF-4, RF-18, RF-19, RF-27 a RF-31, RF-36 a RF-38, RF-40, RF-55, RF-57 a RF-61 |
| `undo-core` | `src/lib/calendar/undo.ts` | Tipos `UndoToken` (`{ kind: "change", id, before, updatedAt, scope? }`, `{ kind: "restore", trashId, synced }`, `{ kind: "unpaste", id }`) y textos de aviso ("Evento movido", "Duración cambiada", "Color cambiado", "Evento borrado", "Evento pegado", "Evento copiado") | — | RF-24, RF-25, RF-57, RF-58 |
| `toast-undo` | `src/components/ui/toast.tsx` | `show(text, { undo })`: con acción dura 10 s y pinta "Deshacer" (`pointer-events-auto`, `min-h-11`); un aviso nuevo sustituye al anterior y su "Deshacer" (solo la última acción); al pulsar, ejecuta, quita el aviso y muestra el resultado | No sabe qué se deshace | RF-24 a RF-26, RF-30 |
| `workspace-interactions` | `src/components/calendar/calendar-workspace.tsx`, `src/components/calendar/event-interactions.tsx` (contexto) | Contexto con: calendarios editables (de `editableCalendars`, criterio `canWriteEvents`), cambios optimistas por id hasta el `router.refresh()`, `dragging` (desactiva deslizar y la ventana rápida, RF-21), el último día o franja pulsado o enfocado (para pegar), el portapapeles del evento, y el diálogo de alcance para repeticiones | No calcula posiciones | RF-1, RF-2, RF-4, RF-18, RF-21, RF-58, RF-59, decisión de repeticiones |
| `scope-choice` | `src/components/recurrence/series-scope-choice.tsx` | Diálogo de alcance fuera de un formulario (mismos textos y mismo aviso de pérdidas que `SeriesScopeDialog`, que se reutiliza para la marca y los textos) que devuelve el alcance elegido o `null` | — | decisión de repeticiones |
| `event-menu` | `src/components/calendar/event-menu.tsx` | Menú propio (`role="menu"`): colores como `menuitemradio` con `aria-checked` y una marca ✓ (icono SVG), "Color del calendario", separador, "Duplicar" y "Borrar". Flechas, Inicio/Fin, Intro, Escape, clic fuera; foco al primer elemento y vuelta al evento al cerrar. Se abre con `contextmenu` de ratón o con la tecla Menú y Mayús+F10; con el dedo no (RF-43); si no se puede editar, no se llama a `preventDefault` (RF-41). Posición con `popover.ts` | — | RF-32 a RF-43 |
| `event-keys` | `src/lib/calendar/shortcuts.ts`, `src/lib/hooks/use-calendar-shortcuts.ts`, `src/lib/hooks/use-event-keys.ts`, `src/components/calendar/go-to-date-dialog.tsx`, `src/components/calendar/shortcuts-help.tsx` | Tabla `SHORTCUTS` (tecla, descripción) que usan la detección y la ayuda. Atajos globales nuevos: G (diálogo con un campo de fecha → misma vista en esa fecha), ? (ayuda), Ctrl/⌘+V (pegar). Atajos de un evento enfocado: Supr/Retroceso, Ctrl/⌘+C (salvo con texto seleccionado), Alt+flechas (mueve en pantalla y guarda 600 ms después de la última pulsación, un solo aviso y un solo "Deshacer"), Menú/Mayús+F10. En el detalle: E, Supr, Ctrl/⌘+C. Mismas reglas: nunca escribiendo ni con otra ventana abierta | — | RF-33, RF-54 a RF-64 |
| `bottom-sheet` | `src/components/calendar/event-modal.tsx`, `src/lib/calendar/sheet.ts`, `src/app/dashboard/@modal/(.)events/[id]/page.tsx` | El detalle interceptado pasa `variant="sheet"`. Hasta 768 px, el `<dialog>` se ancla abajo a media pantalla (`data-sheet="half"`) con un asa; arrastrar el asa o la cabecera arriba → `full`, abajo desde `half` → cerrar (con la confirmación de cambios sin guardar). Pulsar el fondo cierra. "Editar" pasa a `full` (RF-47). `sheet.ts`: decisión pura según desplazamiento y velocidad. Desde 769 px, la ventana de siempre | El alta y la edición desde la URL siguen a pantalla completa | RF-44 a RF-48 |
| `grid-zoom` | `src/lib/hooks/use-grid-zoom.ts`, `src/lib/calendar/zoom.ts`, `src/components/calendar/time-grid.tsx` | `HOUR_PX` pasa a ser estado (`hourPx`, 48 por defecto, entre 24 y 144). Dos punteros sobre la rejilla o Ctrl + rueda (oyente no pasivo con `preventDefault`) cambian la altura; `zoom.ts` calcula la nueva altura y el `scrollTop` que deja fija la hora bajo los dedos o el puntero. Se guarda en `localStorage` (`cafam-hour-px`, con `try/catch`). El segundo dedo cancela la pulsación larga de un evento (pellizco sobre un evento) | — | RF-49 a RF-53 |
| `validation` | `tests/integration/event-undo.test.ts`, tests unitarios, capturas, prueba táctil y con Google | Matriz de permisos de `snapshot_event`/`restore_event`, ciclo de deshacer con imágenes y comentarios, purga, y las pruebas manuales de la spec | — | todos |

## Modelo de datos

### `public.event_trash` (migración `event_undo`)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` PK `default gen_random_uuid()` | |
| `deleted_by` | `uuid not null default auth.uid() references profiles (id) on delete cascade` | Solo quien borra puede deshacer |
| `calendar_id` | `uuid not null references calendars (id) on delete cascade` | Si el calendario se borra, no hay nada que deshacer |
| `event` | `jsonb` | La fila de `events` tal cual (id, autor, series, excepción…). Nula si la repetición borrada no tenía fila |
| `series_id`, `original_start` | `uuid`, `timestamptz` | Solo al borrar una repetición: deshacer quita la fecha de `exdates` |
| `images` | `jsonb not null default '[]'` | Filas `ready` de `event_images` (mismos `id` y `object_id`) |
| `comments` | `jsonb not null default '[]'` | Filas de `event_comments` |
| `created_at` | `timestamptz not null default now()` | |

- **RLS:** activada, sin políticas para clientes (como `email_outbox`): solo se usa desde las funciones. `list_tables_without_rls()` sigue vacía.
- **`snapshot_event(p_event_id uuid, p_original_start timestamptz default null) returns uuid`** (`SECURITY DEFINER`, `search_path = ''`): exige `calendar_role_for(calendario) in ('owner','editor')` (si no, `CF404`). Con `p_original_start`, `p_event_id` es la serie y se guarda su excepción de esa fecha si existe. Borra antes las instantáneas anteriores del llamante (RF-30: solo la última). No borra nada: el borrado sigue por su camino (Google primero, `delete_occurrences`, RLS).
- **`restore_event(p_trash_id uuid, p_event_id uuid default null) returns uuid`** (`SECURITY DEFINER`): exige `deleted_by = auth.uid()`, `created_at > now() - interval '1 minute'` (10 s de la interfaz más margen) y el rol owner/editor en el calendario hoy (`CF404` si no). Sin `p_event_id` vuelve a insertar la fila con su id, autor y fechas (`23505` si el id ya existe → "cambió entretanto"); con `p_event_id` (traídos: el evento ya lo creó `sync_commit_event` tras crearlo en Google) le pone el autor original y cuelga de él lo demás. Si la fila era de una repetición, quita `original_start` de `exdates` de la serie (la serie tiene que seguir existiendo). Vuelve a insertar imágenes y comentarios, **borra sus `object_id` de `image_purge_queue`** y borra la instantánea. Una sola transacción.
- **`images_claim_purge` (`create or replace`):** sin `p_object_ids` (la purga horaria) no reclama filas con `queued_at > now() - interval '2 minutes'`. El borrado de una sola imagen (spec 012) pasa ids y sigue siendo inmediato.
- **`pg_cron` `event-trash-purge`** (05:00 UTC): borra instantáneas de más de 1 hora. Las demás caducan solas por la condición de `restore_event`.
- Sin cambios en `events`: el "Deshacer" de un movimiento usa `updated_at`, que ya existe.

### Estado del cliente (sin persistencia en servidor)

- `UndoToken` en el aviso (10 s, memoria). Portapapeles del evento: id del evento copiado en el contexto del marco (`AppFrame`), solo en memoria (no se toca el portapapeles del sistema).
- `cafam-hour-px` en `localStorage` (RF-53), leído con `useSyncExternalStore` para no romper la hidratación.

## Contratos e interfaces

### Server Actions (`quick-actions.ts`)

```ts
type Change =
  | { kind: "times"; startsAt: string; endsAt: string; allDay: boolean } // instantes UTC
  | { kind: "color"; color: string | null };                             // null = color del calendario
type QuickResult =
  | { ok: true; id: string; undo?: UndoToken }   // sin undo con "following"/"all"
  | { ok: false; error: string; gone?: true; loss?: Loss };

quickChange(id: string, change: Change, opts?: { scope?: SeriesScope; confirmLoss?: boolean }): Promise<QuickResult>
pasteEvent(sourceId: string, target: { day: string; minute?: number }): Promise<QuickResult>
deleteForUndo(id: string, opts?: { scope?: SeriesScope; confirmLoss?: boolean }): Promise<QuickResult>
undoAction(token: UndoToken): Promise<{ ok: true } | { ok: false; error: string }>
```

- `id` se valida con `parseEventId` (repeticiones). El color, con `isPaletteColor`. Las horas, con el mismo `zod` que el formulario (fin ≥ inicio, día completo a medianoche UTC).
- `quickChange` de color en un traído: `toGooglePatch` no incluye el color, así que el `PATCH` va vacío y se omite la llamada a Google; solo se guarda en CaFam (RF-38).
- `pasteEvent`: si `target.minute` falta, usa la hora del original (RF-59). Un día completo conserva el número de días. Sin permiso en el calendario → `CALENDAR_MESSAGES.forbidden` o el motivo de `readOnlyReason` (RF-60). Nunca copia imágenes ni comentarios (RF-61). Una repetición se pega como suelto.
- `undoAction`:
  - `change`: lee `updated_at`; si no es el del token → "Este evento ha cambiado; no se ha deshecho" (RF-29). Si coincide, `quickChange` con los valores `before` (repetición: alcance "Solo este evento").
  - `restore`: traído → `writeEvent({ op: "create" })` con la fila de la instantánea y después `restore_event(trash, nuevoId)`; normal → `restore_event(trash)`. Si Google lo rechaza, el mensaje de `WRITE_ERRORS` (RF-29).
  - `unpaste`: borra la copia por el camino normal.
- Errores: `WRITE_ERRORS` (Google), `getCalendarErrorMessage` (RLS, red), `recurrenceErrorMessage` (series), `gone` como en la 009.

### Componentes

- `DraggableEvent({ event, timeZone, shape, view, editable, … })`: envuelve `EventBlock` (que no cambia de forma) y le pone `data-event-id`, `tabIndex`, los manejadores y, si `editable`, `aria-describedby` a una ayuda oculta ("Alt y flechas para mover. Mayús+F10 para el menú."). No editable → `EventBlock` tal cual (RF-2).
- `EventMenu({ event, at: Box | Point, onClose })`.
- `SeriesScopeChoice({ open, kind: "change" | "delete", loss?, onChoose })`.
- `GoToDateDialog`, `ShortcutsHelp`: `<dialog>` modales con `ConfirmDialog` como modelo.
- `EventModal({ title, variant?: "window" | "sheet", children })`.
- `TimeGrid` recibe `hourPx` y `onZoom`.
- `ToastProvider.show(text: string, options?: { undo?: () => Promise<string | null> })`: la promesa devuelve el texto del aviso siguiente (error o `null` si se deshizo bien → "Deshecho").

## Flujo principal paso a paso

1. Un Editor arrastra con el ratón un evento de las 10:00–11:00 del martes al jueves a las 12:15 en la vista semana. `DraggableEvent` comprueba que su calendario es editable (RF-1, RF-2), pasa el umbral de 4 px y levanta el bloque; la ventana rápida y el deslizar quedan desactivados (RF-21, RF-23).
2. En cada movimiento `drag.ts` calcula el cuarto de hora y el día bajo el puntero (RF-5, RF-7); el bloque muestra "12:15–13:15" (RF-8) y la región `aria-live` lo anuncia al cambiar. Cerca del borde inferior la rejilla se desplaza (RF-9). Escape lo cancelaría (RF-20).
3. Al soltar, si el resultado es igual al original no se hace nada (RF-19). Si no, el workspace pinta el evento en su sitio nuevo y llama a `quickChange` sin confirmar (RF-18).
4. Si el calendario es traído, `writeEvent` escribe en Google y luego en CaFam (RF-3). Si algo falla, el evento vuelve a su sitio y el aviso da el motivo (RF-4).
5. Con éxito, aviso "Evento movido" con "Deshacer" durante 10 s (RF-24, RF-26) y `router.refresh()`. "Deshacer" comprueba `updated_at` y escribe los valores anteriores (RF-27, RF-29).
6. Si era una repetición, entre 3 y 4 se abre el diálogo de alcance; cancelar lo devuelve a su sitio, y solo "Solo este evento" deja "Deshacer" (decisión de repeticiones).
7. Clic derecho sobre otro evento → menú (RF-32); elige "Lavanda" → `quickChange` de color, cierra y "Color cambiado" con "Deshacer" (RF-36, RF-24). "Borrar" → `deleteForUndo` sin confirmar, "Evento borrado" con "Deshacer" (RF-40, RF-25, RF-31); "Deshacer" lo recupera con imágenes, comentarios, autor y calendario (RF-28).
8. En el móvil, pulsar un evento abre la hoja a media pantalla (RF-44); deslizar arriba la amplía, abajo la cierra (RF-45, RF-46). Mantenerlo pulsado 500 ms lo levanta, con su tirador de fin (RF-6, RF-11). Pellizcar la rejilla cambia la altura de las horas (RF-49).

## Decisiones técnicas

- **D1: arrastre con Pointer Events propios y la lógica en `drag.ts` puro.** Descartadas HTML5 drag and drop (no funciona con el dedo ni deja pasos de 15 min con vista previa propia) y cualquier librería (P6). Motivo: un solo código para ratón y dedo, y lo difícil (horas, días, cambio de hora) testeado sin DOM, como `slots.ts` en la 008. Cubre: RF-5 a RF-17, RF-22.
- **D2: durante el arrastre, `transform` en `requestAnimationFrame`; estado de React solo al cambiar de cuarto de hora o de día.** Descartado guardar la posición en estado en cada `pointermove`. Motivo: volver a pintar la vista en cada movimiento no llega a 60 fps en un móvil de gama media. Cubre: rendimiento, RF-8.
- **D3: destino con `document.elementFromPoint` sobre atributos `data-day`/`data-allday-day`.** Descartado calcular columnas con geometría propia. Motivo: las columnas ya llevan `data-day`, funciona igual en semana, día y mes, y soltar fuera (sin destino) cancela solo (caso límite). Cubre: RF-7, RF-13 a RF-17.
- **D4: pulsación larga de 500 ms con tolerancia de 8 px; hasta entonces no se captura el puntero y la rejilla se desplaza con normalidad.** Al levantar, el bloque toma `touch-action: none` y un oyente `touchmove` no pasivo hace `preventDefault`. Descartado `touch-action: none` en todos los bloques. Motivo: rompería el desplazamiento y el deslizar de la 016 sobre los eventos (RF-22). Cubre: RF-6, RF-22.
- **D5: una acción `quickChange` que reutiliza `updateSingle` y `changeOccurrence`.** Descartado enviar el formulario completo oculto o duplicar la lógica de Google y series. Motivo: Google primero (009), alcance y pérdidas (013) y los mensajes de error ya están probados ahí; solo cambia de dónde salen los datos. Cubre: RF-3, RF-4, RF-18, RF-36 a RF-38.
- **D6: deshacer un borrado con una instantánea en `event_trash` y `restore_event` `SECURITY DEFINER`.** Descartados: (a) borrado diferido en el cliente (si se cierra la app el evento no se borraría nunca: perdería datos o el borrado), (b) borrado lógico con `deleted_at` en `events` (habría que tocar todas las lecturas, RLS, la sincronización y las vistas). Motivo: no cambia ninguna lectura; las imágenes, los comentarios y el autor no los puede insertar un cliente (RLS), así que hace falta una función que lo haga con las comprobaciones de rol. Cubre: RF-25, RF-28, RF-29.
- **D7: la purga horaria no reclama objetos encolados hace menos de 2 min, y `restore_event` los saca de la cola.** Descartado mover la purga de las imágenes de los eventos borrados a la instantánea. Motivo: un cambio de una condición en una función existente; el borrado de una imagen suelta (que pasa ids) sigue siendo inmediato. Cubre: RF-28.
- **D8: deshacer un movimiento comprueba `updated_at` en la acción.** Descartado deshacer sin comprobar. Motivo: RF-29 y el caso límite de dos personas; `updated_at` ya lo mantiene `set_updated_at`. Cubre: RF-27, RF-29.
- **D9: el token de deshacer y el portapapeles solo en memoria del cliente.** Descartados guardarlos en la base de datos o en el portapapeles del sistema. Motivo: la spec limita a la última acción y a 10 s, y al cerrar la app ya no se puede; el portapapeles del sistema pediría permisos y mezclaría texto con eventos (caso límite de Ctrl+C con texto). Cubre: RF-26, RF-30, RF-57.
- **D10: repeticiones con el diálogo de alcance antes de guardar (decisión del usuario).** Descartados "siempre solo esta" y "no se arrastran". Motivo: es lo que hace Google y reutiliza `planSeriesChange`/`planSeriesDelete` con su aviso de pérdidas. "Deshacer" solo con "Solo este evento", porque deshacer un corte de serie o un cambio de toda la serie no es un simple "volver a los valores de antes". Cubre: caso límite de repeticiones, RF-30.
- **D11: Alt+flechas mueve en pantalla y guarda 600 ms después de la última pulsación.** Descartado guardar en cada pulsación. Motivo: cuatro pulsaciones serían cuatro escrituras (cuatro en Google) y cuatro avisos; así hay un solo "Deshacer" que vuelve al principio. Cubre: RF-64, RF-30.
- **D12: menú contextual propio con `role="menu"` y `menuitemradio`.** Descartado reutilizar `ColorPicker` (radios de formulario). Motivo: el patrón de menú de ARIA da las flechas, Intro y Escape que pide RF-42, y `aria-checked` más una ✓ cumple RF-35. Cubre: RF-32 a RF-43.
- **D13: el menú solo se abre si el último `pointerdown` no fue táctil.** Descartado `matchMedia("(pointer: fine)")` solo. Motivo: un portátil táctil tiene los dos; lo que cuenta es con qué se hizo el gesto. Además, mantener pulsado con el dedo es el arrastre (D4). Cubre: RF-43.
- **D14: la hoja inferior es el mismo `EventModal` con `variant="sheet"`.** Descartado un componente de hoja nuevo con su propia ruta. Motivo: conserva el foco, Escape, la confirmación de cambios sin guardar y los arreglos de Activity de la 008 (RF-48); solo cambian la colocación y el gesto del asa. Cubre: RF-44 a RF-48.
- **D15: altura de la hora en estado con `localStorage`, con el ancla calculada en `zoom.ts`.** Descartado guardarlo en `profiles` (la spec pide "en ese dispositivo") y escalar con CSS `transform: scale` (deformaría el texto). Motivo: RF-51 a RF-53 con una función pura testeable. Cubre: RF-49 a RF-53.
- **D16: la ayuda "?" y la detección leen la misma tabla `SHORTCUTS`.** Descartado escribir la ayuda a mano. Motivo: no pueden desincronizarse. Cubre: RF-62.
- **D17: borrar un solo evento sin `ConfirmDialog` en el detalle, el menú y Supr.** La repetición sigue pasando por el diálogo de alcance (no es una confirmación) y por el aviso de pérdidas de la 013. Cubre: RF-31.

## Trazabilidad RF → módulo

| RF | Módulos |
|----|---------|
| RF-1 | workspace-interactions (`canWriteEvents`), quick-actions, RLS y funciones existentes |
| RF-2 | drag-hook (no editable → enlace normal), workspace-interactions |
| RF-3 | quick-actions (`writeEvent` vía `updateSingle`) |
| RF-4 | workspace-interactions (revertir), quick-actions (mensajes), toast-undo |
| RF-5 | drag-core, drag-hook |
| RF-6 | drag-hook (D4) |
| RF-7 | drag-core, drag-hook (D3) |
| RF-8 | drag-core (texto), drag-hook |
| RF-9 | drag-hook (desplazamiento automático) |
| RF-10 | drag-core (`resize`), drag-hook |
| RF-11 | drag-hook (tirador al levantar) |
| RF-12 | drag-core |
| RF-13 | drag-core, drag-hook (`data-allday-day`) |
| RF-14 | drag-core |
| RF-15 | drag-core, drag-hook |
| RF-16 | drag-core, drag-hook (mes) |
| RF-17 | drag-core |
| RF-18 | workspace-interactions, quick-actions |
| RF-19 | drag-core (sin cambio) |
| RF-20 | drag-hook |
| RF-21 | workspace-interactions (`dragging`) |
| RF-22 | drag-hook (D4) |
| RF-23 | drag-hook (sobre un evento) y `SlotLayer` sin cambios |
| RF-24 | toast-undo, undo-core |
| RF-25 | quick-actions (`deleteForUndo`), undo-schema, toast-undo |
| RF-26 | toast-undo |
| RF-27 | quick-actions (`undoAction`), D8 |
| RF-28 | undo-schema (`restore_event`), quick-actions |
| RF-29 | quick-actions (`updated_at`, Google), undo-schema |
| RF-30 | toast-undo, undo-schema (una instantánea por usuario) |
| RF-31 | quick-actions, event-menu, event-keys, `EventDetail` sin `ConfirmDialog` (D17) |
| RF-32 | event-menu |
| RF-33 | event-menu, event-keys |
| RF-34 | event-menu |
| RF-35 | event-menu |
| RF-36 | event-menu, quick-actions |
| RF-37 | event-menu, quick-actions (`color: null`) |
| RF-38 | quick-actions (sin llamada a Google) |
| RF-39 | event-menu (`/dashboard/events/new?from=`) |
| RF-40 | event-menu, quick-actions |
| RF-41 | event-menu |
| RF-42 | event-menu |
| RF-43 | event-menu (D13) |
| RF-44 | bottom-sheet |
| RF-45 | bottom-sheet (`sheet.ts`) |
| RF-46 | bottom-sheet |
| RF-47 | bottom-sheet |
| RF-48 | bottom-sheet (mismo `EventModal`) |
| RF-49 | grid-zoom |
| RF-50 | grid-zoom |
| RF-51 | grid-zoom (`zoom.ts`) |
| RF-52 | grid-zoom (`zoom.ts`) |
| RF-53 | grid-zoom (`localStorage`) |
| RF-54 | event-keys (E en el detalle) |
| RF-55 | event-keys, quick-actions |
| RF-56 | event-keys (`GoToDateDialog`) |
| RF-57 | event-keys, workspace-interactions (portapapeles) |
| RF-58 | event-keys, workspace-interactions (último día o franja), quick-actions (`pasteEvent`) |
| RF-59 | quick-actions (`pasteEvent` sin minuto) |
| RF-60 | quick-actions |
| RF-61 | quick-actions |
| RF-62 | event-keys (`ShortcutsHelp`, D16) |
| RF-63 | event-keys |
| RF-64 | event-keys, drag-core (D11) |

## Riesgos y mitigaciones

- **R1: Safari iOS empieza a desplazar o muestra el menú de enlace durante la pulsación larga.** Mitigación: `-webkit-touch-callout: none` y `user-select: none` en los bloques editables, `contextmenu` con `preventDefault` si el gesto es táctil y `touchmove` no pasivo tras levantar (D4). Se prueba en el iPhone real (criterio de finalización).
- **R2: pellizcar amplía toda la página en iOS.** Mitigación: `touch-action: pan-x pan-y` en la rejilla (el navegador no hace el zoom de página ahí) y el gesto propio con dos punteros. Fuera de la rejilla el zoom del sistema sigue funcionando (accesibilidad).
- **R3: Activity conserva la vista oculta con sus oyentes y temporizadores** (trampa de la 008). Mitigación: los oyentes de `window` del arrastre y del zoom se quitan en la limpieza del efecto y al soltar; los atajos ya comprueban la ventana abierta.
- **R4: el `router.refresh()` llega antes que otro cambio optimista y lo pisa.** Mitigación: los cambios optimistas se guardan por id con el `updated_at` esperado y se descartan cuando el dato del servidor ya lo trae o lo supera.
- **R5: la purga horaria coincide con los 10 s de "Deshacer".** Mitigación: D7 (2 min de margen).
- **R6: deshacer el borrado de un evento traído crea un evento nuevo en Google** (caso límite aceptado por la spec): su `external_id` cambia y las invitaciones o enlaces externos de Google se pierden. Se avisa en la prueba con Google; no es un fallo.
- **R7: `event_trash` guarda una copia de comentarios ajenos durante un rato.** Mitigación: solo la lee `restore_event` para quien borró (sin políticas de lectura), se sustituye en el siguiente borrado y `event-trash-purge` borra lo de más de 1 h.
- **R8: el clic del enlace tras arrastrar abre el detalle.** Mitigación: `DraggableEvent` cancela el `click` siguiente si hubo movimiento (como hace hoy `SlotLayer` con su umbral).
- **R9: conflicto entre el arrastre del evento y el de crear en un hueco.** Mitigación: el evento detiene la propagación de `pointerdown` a `SlotLayer`; un hueco sigue creando (RF-23).

## Dudas abiertas

- Ninguna. Decisiones por defecto que el usuario puede cambiar al aprobar: 2 min de margen en la purga, instantáneas borradas tras 1 h, Alt+flechas guarda a los 600 ms, altura de la hora entre 24 y 144 px.
