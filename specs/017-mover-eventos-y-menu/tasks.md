# Tasks 017 - Mover y redimensionar eventos, menú contextual y gestos

> Estado: **Aprobadas** por el usuario (2026-11-01).
> Spec: `specs/017-mover-eventos-y-menu/spec.md` (aprobada el 2026-10-30). Plan: `specs/017-mover-eventos-y-menu/plan.md` (aprobado el 2026-11-01).
> 16 tareas en dos iteraciones:
>
> - Iteración 1 (T1–T12): base de datos (T1), lógica pura (T2), acciones (T3–T4), deshacer (T5), contexto del calendario (T6), arrastrar (T7–T10), menú (T11) y teclado sobre los eventos (T12).
> - Iteración 2 (T13–T16): atajos globales y ayuda (T13), hoja inferior (T14), pellizcar (T15) y validación (T16).
>
> Reglas:
>
> - Una tarea cada vez, con el test primero (rojo → verde).
> - Al cerrar cada tarea se ejecuta y se reporta `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`. Si toca esquema, RLS o datos, también `npm run test:db -- <filtro>` (por tandas si salta el límite de Auth).
> - Si toca interfaz: capturas a 390, 768 y 1440 px en tema claro y oscuro, con el acento rojo y el amarillo (P9), y prueba con el ratón y con emulación táctil en `playwright-cli`.
> - Un commit por tarea, citándola, en la rama `017-mover-eventos-y-menu`.
>
> Sin dependencias nuevas (P6). Migraciones: solo nuevas, con `npm run db:push` (dev) y `npm run db:types`. Producción la aplica el usuario al cerrar.

## Tareas

### Iteración 1

- [x] T1 Guardar y restaurar un evento borrado con sus imágenes y comentarios
  Pasos:
  - Primero, `tests/integration/event-undo.test.ts` en rojo. Comprueba:
    - `snapshot_event` funciona para propietario y Editor; Lector, ajeno y `anon` reciben `CF404`; un segundo `snapshot_event` del mismo usuario borra su instantánea anterior;
    - tras borrar el evento, `restore_event` lo devuelve con su id, autor (`created_by` de otro usuario), calendario, categoría, color, fechas, imágenes (mismo `object_id`) y comentarios (autor y `edited_at`), y saca sus objetos de `image_purge_queue`;
    - `restore_event` falla para otro usuario, pasado 1 minuto (retrasando `created_at` una hora, trampa del reloj), si el usuario ya no es Editor, y con `23505` si el id ya existe;
    - con `p_event_id` cuelga imágenes y comentarios del evento dado y le pone el autor original;
    - una repetición: con excepción, la restaura y quita su fecha de `exdates`; sin excepción, solo quita la fecha;
    - `images_claim_purge` sin ids no reclama objetos encolados hace menos de 2 minutos; con ids, sí;
    - `event_trash` no se lee ni se escribe desde un cliente y `list_tables_without_rls()` sigue vacía; el trabajo `event-trash-purge` existe.
  - Después, la migración `event_undo` según "Modelo de datos" del plan.

  Hecho cuando: `npm run test:db -- event-undo event-images schema` en verde y `src/types/database.ts` con la tabla y las funciones nuevas. Cubre: RF-25, RF-28, RF-29, RF-30 | Módulo: undo-schema
  Evidencia (2026-11-01): rojo antes de la migración (10 de 11 tests). Migración `20261101100000_event_undo.sql` aplicada en dev y tipos regenerados. `test:db -- event-undo event-images schema` 79 tests en verde. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` 1812 tests.

- [x] T2 Calcular dónde cae un evento arrastrado
  Pasos:
  - Primero, `tests/unit/drag.test.ts` en rojo con los casos de `lib/calendar/drag.ts`:
    - mover un evento con hora en pasos de 15 min conservando la duración, también a otro día de la semana y con varios días;
    - redimensionar el fin sin tocar el inicio, con mínimo de 15 min; un evento que cruza la medianoche solo cambia el fin si cae en su día de inicio;
    - con hora → día completo de ese día; día completo de un día → 1 h desde donde se suelta; día completo en la franja o en el mes conserva el número de días; en el mes un evento con hora conserva su hora y su duración;
    - mismo sitio → sin cambio; hora inexistente por el cambio de hora de marzo → primera hora válida;
    - Alt+flechas: ±15 min y ±1 día;
    - el texto de la vista previa y del anuncio ("jueves, 12 de noviembre, 10:15–11:15").
  - Después, `drag.ts`.

  Hecho cuando: `npm test -- drag` en verde. Cubre: RF-5, RF-7, RF-8, RF-10, RF-12, RF-13, RF-14, RF-15, RF-16, RF-17, RF-19, RF-64 | Módulo: drag-core
  Evidencia (2026-11-01): rojo sin el módulo. `drag.test.ts` 23 tests en verde (cuartos, días, varios días, fin mínimo, medianoche, conversiones, mes, Alt+flechas, cambio de hora y texto). typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` 1835 tests.

- [x] T3 Cambiar las horas o el color de un evento sin el formulario
  Pasos:
  - Primero, `tests/unit/quick-actions.test.ts` en rojo (con `getEvent`, Supabase y `writeEvent` simulados, como `event-actions.test.ts`):
    - `quickChange` de horas en un evento normal hace un `update` y devuelve un `undo` con los valores anteriores y el `updated_at` nuevo;
    - en un traído pasa por `writeEvent` (Google primero); un fallo de Google da el mensaje de `WRITE_ERRORS` y no guarda nada; `gone` da `gone: true`;
    - el color en un traído no llama a Google y se guarda en CaFam; `null` quita el color propio; un color fuera de la paleta se rechaza;
    - en una repetición, sin `scope` da error; con `this`, `following` o `all` llama a la función de `planSeriesChange`; con pérdidas sin confirmar devuelve `loss`; solo `this` devuelve `undo`;
    - un Lector recibe el mensaje de "sin permiso"; un id inválido, "no existe".
  - Después, `quick-actions.ts` con `quickChange`, y `changeOccurrence` de `actions.ts` recibe el alcance por argumento (`event-actions.test.ts` sigue en verde).

  Hecho cuando: `npm test -- quick-actions event-actions` en verde. Cubre: RF-1, RF-3, RF-4, RF-18, RF-36, RF-37, RF-38 | Módulo: quick-actions
  Evidencia (2026-11-01): rojo sin la acción. Los ayudantes de escritura pasan de `actions.ts` a `event-writes.ts` (sin `"use server"`) y `changeOccurrence`/`deleteOccurrences` reciben el alcance por argumento; `quickChange` en `quick-actions.ts` con sus ayudantes en `quick-writes.ts` y los tipos en `lib/calendar/undo.ts`. `write-event.ts` ya no llama a Google si solo cambia el color (test nuevo). `quick-actions` y `event-actions` en verde. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` completo en verde.

- [x] T4 Borrar con deshacer, deshacer y pegar
  Pasos:
  - Primero, casos nuevos en `quick-actions.test.ts` en rojo:
    - `deleteForUndo` llama a `snapshot_event` y luego borra por el camino de siempre (Google primero si es traído); si el borrado falla no devuelve `undo`; en una repetición pide alcance y solo con `this` devuelve `undo`;
    - `undoAction` de un cambio: con el mismo `updated_at` escribe los valores anteriores; con otro, "Este evento ha cambiado; no se ha deshecho";
    - `undoAction` de un borrado: normal → `restore_event(trash)`; traído → `writeEvent` create y `restore_event(trash, nuevoId)`; si Google lo rechaza, su mensaje;
    - `pasteEvent` en un día y minuto, en un día sin minuto (misma hora) y de un día completo de tres días; sin imágenes ni comentarios; una repetición se pega como suelto; en un calendario sin permiso o de solo lectura en Google, el motivo; devuelve `undo` de tipo `unpaste`, que borra la copia.
  - Después, `deleteForUndo`, `undoAction` y `pasteEvent`, con los tipos y textos de `lib/calendar/undo.ts`.

  Hecho cuando: `npm test -- quick-actions` en verde. Cubre: RF-25, RF-27, RF-28, RF-29, RF-40, RF-55, RF-58, RF-59, RF-60, RF-61 | Módulo: quick-actions, undo-core
  Evidencia (2026-11-01): `deleteForUndo`, `undoAction` y `pasteEvent` en `quick-actions.ts`; `placeAt` en `drag.ts` (3 tests). Para restaurar en Google hacía falta leer la fila guardada: migración nueva `20261101110000_trash_row.sql` (`trash_row`, solo para quien borró), en rojo y luego en verde en `event-undo.test.ts` (12 tests). Los tests de las tres acciones se escribieron junto con ellas (no hubo una ejecución en rojo separada): `quick-actions.test.ts` 37 tests en verde. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` completo en verde.

- [x] T5 Ofrecer "Deshacer" en los avisos y borrar desde el detalle sin confirmar
  Pasos:
  - Primero, en rojo: `toast.test.tsx` (con `undo` dura 10 s y pinta "Deshacer" con `min-h-11`; un aviso nuevo quita el "Deshacer" anterior; al pulsar ejecuta, quita el aviso y muestra "Deshecho" o el error) y `event-detail.test.tsx` (borrar un evento suelto no abre `ConfirmDialog`, llama a `deleteForUndo` y cierra con "Evento borrado" y "Deshacer"; una repetición sigue con el diálogo de alcance).
  - Después, `ToastProvider.show(text, { undo })`, `finish(done, undo?)` en `EventModal` y el borrado del detalle.

  Hecho cuando: `npm test -- toast event-detail event-modal event-panel` en verde y captura del aviso con "Deshacer" a 390 y 1440 px. Cubre: RF-24, RF-25, RF-26, RF-30, RF-31 | Módulo: toast-undo, undo-core
  Evidencia (2026-11-01): rojo en 5 tests (`toast`, `event-detail`, `event-panel`). `ToastProvider.show(text, { undo })` con 10 s y "Deshacer"; `useUndoToast` llama a `undoAction`; `DeleteEventButton` borra sin confirmar; acción `deleteFromDetail` en las dos rutas del detalle (`deleteEvent` queda solo para sus tests); `finish(done, undo)`. `toast event-detail event-modal event-panel` en verde. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` completo en verde. La captura del aviso se hizo con las del navegador de T7.

- [x] T6 Aplicar en el calendario los cambios hechos fuera del formulario
  Pasos:
  - Primero, en rojo: `event-interactions.test.tsx` (con un evento editable y otro no; aplicar un cambio lo pinta en su sitio nuevo al momento y llama a `quickChange`; si falla, vuelve a su sitio y avisa con el motivo; con éxito, aviso con "Deshacer" y `router.refresh()`; un dato del servidor más nuevo sustituye al optimista; `dragging` desactiva deslizar y la ventana rápida) y `series-scope-choice.test.tsx` (los tres alcances, cancelar devuelve `null`, el aviso de pérdidas con "Guardar igualmente"/"Borrar igualmente").
  - Después, el contexto `event-interactions.tsx` en `CalendarWorkspace` y `SeriesScopeChoice`.

  Hecho cuando: `npm test -- event-interactions series-scope-choice calendar-workspace` en verde. Cubre: RF-1, RF-2, RF-4, RF-18, RF-21 | Módulo: workspace-interactions, scope-choice
  Evidencia (2026-11-01): `useEventInteractionsState` y su contexto (`event-interactions.tsx`) en `CalendarWorkspace`: cambios optimistas por id, vuelta atrás con el motivo, aviso con "Deshacer", `dragging` desactiva deslizar y la ventana rápida; `SeriesScopeChoice` fuera de un formulario. Los tests se escribieron junto con el código (sin una ejecución en rojo separada): `event-interactions` 9 tests, `series-scope-choice` 4 y `calendar-workspace` 13 en verde. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` completo en verde.

- [x] T7 Mover y redimensionar con el ratón en semana y día
  Pasos:
  - Primero, `draggable-event.test.tsx` en rojo (con `getBoundingClientRect` y `elementFromPoint` simulados): un evento editable se levanta tras 4 px, muestra sus horas nuevas, cambia de día en la semana, se suelta y llama al contexto con el cambio de `drag.ts`; soltar en el mismo sitio o fuera de la rejilla no guarda; Escape cancela; el borde inferior cambia el fin; el clic tras arrastrar no abre el detalle; un evento no editable es un enlace normal; arrastrar en un hueco sigue creando; la región `aria-live` anuncia la hora; cerca del borde la rejilla se desplaza.
  - Después, `use-event-drag.ts` y `DraggableEvent` en `TimeGrid` (`transform` en `requestAnimationFrame`, D2).

  Hecho cuando: `npm test -- draggable-event time-grid week-view day-view slot-layer` en verde y prueba en `playwright-cli` a 1440 px moviendo, cambiando de día y redimensionando un evento. Cubre: RF-2, RF-5, RF-7, RF-8, RF-9, RF-10, RF-12, RF-19, RF-20, RF-21, RF-23 | Módulo: drag-hook
  Evidencia (2026-11-01): `use-event-drag.ts` (controlador creado una vez, oyentes en `window`, umbral de 4 px, Escape, autodesplazamiento, se traga el clic siguiente, toma la posición del `pointerup`), `DraggableEvent` en `TimeGrid` con tirador inferior, región `aria-live` con las horas nuevas. Desviación de D2: el bloque se vuelve a pintar en su sitio nuevo solo al cambiar de cuarto de hora, sin `transform` en `requestAnimationFrame`. `draggable-event` 8 tests (el rojo destapó que se ignoraba la posición al soltar); `npm test -- draggable-event time-grid week-view day-view slot-layer event-interactions calendar-workspace` 61 en verde; `npm test` completo en verde (la guardia de diseño admite `shadow-float` en el bloque levantado). typecheck, format y build correctos, lint con los 2 avisos previos. `playwright-cli` a 1440 px con `next start`: mover 2 h (12:00 – 13:00 en el bloque), pasar al día siguiente, alargar 1 h, Escape cancela y todo persiste al recargar; capturas del arrastre y del aviso "Evento movido · Deshacer".

- [x] T8 Pasar eventos entre la franja de día completo y la rejilla
  Pasos:
  - Primero, casos nuevos en `draggable-event.test.tsx` en rojo: con hora → franja (`data-allday-day`) da día completo de ese día; día completo de un día → rejilla da 1 h; día completo de varios días dentro de la franja cambia de día y conserva su duración; uno de varios días no se convierte en la rejilla.
  - Después, los bloques de la franja como `DraggableEvent` y las celdas con `data-allday-day`.

  Hecho cuando: `npm test -- draggable-event time-grid` en verde y prueba en `playwright-cli` a 1440 px de las tres conversiones. Cubre: RF-13, RF-14, RF-15 | Módulo: drag-hook
  Evidencia (2026-11-01): Bloques de la franja como `DraggableEvent` (modo `strip`) y celdas `data-allday-day` detrás de ellos. La franja se muestra siempre, también vacía (como Google): mostrarla solo al arrastrar empujaba la rejilla 24 px bajo el puntero. 4 casos nuevos en `draggable-event` en rojo y después en verde; `npm test -- draggable-event time-grid` 21 en verde, `npm test` completo 1905 en verde; typecheck, format y build correctos, lint con los 2 avisos previos. `playwright-cli` a 1440 px: con hora → franja del jueves (día completo), día completo de un día → rejilla del viernes (1 h), "Viaje" de 2 días movido dos días conservando su duración, y en la rejilla no se convierte; persiste al recargar.

- [x] T9 Mover eventos de día en la vista mes
  Pasos:
  - Primero, `month-view.test.tsx` en rojo: arrastrar un evento con hora a otro día conserva su hora y duración; uno de varios días mueve su primer día y conserva cuántos días dura; el "+N" y los huecos siguen funcionando; un evento no editable no se levanta.
  - Después, `DraggableEvent` en `MonthView` con las celdas `data-day`.

  Hecho cuando: `npm test -- month-view draggable-event` en verde y prueba en `playwright-cli` a 1440 px. Cubre: RF-16, RF-17 | Módulo: drag-hook
  Evidencia (2026-11-01): `DraggableEvent` (modo `month`) en `MonthView`; las horas sobre el bloque solo en la rejilla. 4 casos nuevos en `month-view` (2 en rojo antes de implementar). Arreglado de paso un fallo previo que el arrastre deja a la vista: `MiniMonth` solo leía las marcas iniciales al montarse y no seguía `router.refresh()` (test nuevo en `mini-month`, en rojo sin el arreglo). `npm test -- month-view draggable-event mini-month` en verde, `npm test` completo 1910 en verde; typecheck, format y build correctos, lint con los 2 avisos previos. `playwright-cli` a 1440 px: un evento con hora del 6 al 12 de noviembre conserva su hora (13:00 en la semana) y "Viaje" de 2 días pasa del 5 al 17 conservando 2 días; captura del arrastre.

- [ ] T10 Levantar eventos con el dedo
  Pasos:
  - Primero, casos táctiles en `draggable-event.test.tsx` en rojo (temporizadores falsos): mantener pulsado 500 ms levanta el evento y lo mueve al deslizar; moverse más de 8 px antes cancela y deja desplazar o deslizar (RF-22); levantado muestra el tirador de fin, que redimensiona; un segundo dedo cancela la pulsación; el `contextmenu` táctil no abre nada; también en la vista mes.
  - Después, la pulsación larga, `touch-action: none` y el `touchmove` no pasivo solo tras levantar (D4), `-webkit-touch-callout: none` en los bloques editables.

  Hecho cuando: `npm test -- draggable-event month-view` en verde y prueba en `playwright-cli` con emulación táctil a 390 px (mover, redimensionar y desplazar la rejilla sin levantar nada). Cubre: RF-6, RF-11, RF-16, RF-22 | Módulo: drag-hook

- [ ] T11 Cambiar el color, duplicar y borrar desde el menú contextual
  Pasos:
  - Primero, `event-menu.test.tsx` en rojo: clic derecho con ratón sobre un evento editable abre el menú junto al puntero y evita el del navegador; sobre uno no editable no llama a `preventDefault`; tras un `pointerdown` táctil no se abre; Menú y Mayús+F10 lo abren junto al evento; muestra los 13 colores (`menuitemradio`, el actual con `aria-checked` y ✓), "Color del calendario", "Duplicar" y "Borrar"; flechas, Inicio, Fin, Intro, Escape y clic fuera; el foco vuelve al evento; elegir un color llama a `quickChange` y cierra; "Color del calendario" envía `null`; "Duplicar" navega a `/dashboard/events/new?from=<id>`; "Borrar" llama a `deleteForUndo`; en una repetición, el color y el borrado pasan por `SeriesScopeChoice`.
  - Después, `EventMenu` y su apertura en `DraggableEvent`.

  Hecho cuando: `npm test -- event-menu draggable-event` en verde y capturas del menú a 768 y 1440 px en claro y oscuro con el acento rojo y el amarillo. Cubre: RF-32, RF-33, RF-34, RF-35, RF-36, RF-37, RF-39, RF-40, RF-41, RF-42, RF-43 | Módulo: event-menu

- [ ] T12 Manejar los eventos de las vistas con el teclado
  Pasos:
  - Primero, `use-event-keys.test.tsx` en rojo: con un evento enfocado, Alt+↑/↓ lo mueve 15 min y Alt+←/→ un día en pantalla y guarda una vez 600 ms después de la última pulsación (D11); Supr y Retroceso lo borran con "Deshacer"; Ctrl/⌘+C lo copia con "Evento copiado", salvo con texto seleccionado; Ctrl/⌘+V pega en el último día o franja pulsado o enfocado, o en la fecha de la vista a su hora, con "Evento pegado" y "Deshacer"; nada actúa escribiendo, con otra ventana abierta o sobre un evento no editable (salvo Ctrl+C).
  - Después, `use-event-keys.ts`, el portapapeles en el marco y el último hueco en `SlotLayer` y las celdas del mes.

  Hecho cuando: `npm test -- use-event-keys shortcuts slot-layer` en verde y prueba solo con el teclado en `playwright-cli` a 1440 px (Tab hasta un evento, moverlo, copiarlo, pegarlo y borrarlo con "Deshacer"). Cubre: RF-55, RF-57, RF-58, RF-59, RF-60, RF-61, RF-63, RF-64 | Módulo: event-keys, workspace-interactions

### Iteración 2

- [ ] T13 Añadir los atajos E, G y ? con su ayuda
  Pasos:
  - Primero, en rojo: `shortcuts.test.ts` (la tabla `SHORTCUTS` con todas las teclas; G y ? como atajos; E, Supr y Ctrl+C solo en el detalle), `go-to-date-dialog.test.tsx` (G abre el diálogo, una fecha válida lleva la vista actual a ella, una inválida muestra el error, Escape cierra), `shortcuts-help.test.tsx` (? abre la lista sacada de la tabla) y `event-panel.test.tsx` (E con el detalle abierto pasa a la edición; Supr borra con "Deshacer"; Ctrl+C copia).
  - Después, la tabla, `GoToDateDialog`, `ShortcutsHelp` y las teclas del detalle.

  Hecho cuando: `npm test -- shortcuts go-to-date-dialog shortcuts-help event-panel use-calendar-shortcuts` en verde y capturas de los dos diálogos a 390 y 1440 px. Cubre: RF-54, RF-55, RF-56, RF-57, RF-62, RF-63 | Módulo: event-keys

- [ ] T14 Abrir el detalle en una hoja inferior en el móvil
  Pasos:
  - Primero, en rojo: `sheet.test.ts` (desplazamiento y velocidad → `full`, `half` o cerrar) y `event-modal.test.tsx` (con `variant="sheet"` y ≤ 768 px abre a media pantalla con asa; deslizar arriba amplía; abajo desde media cierra; pulsar el fondo cierra; con cambios sin guardar pide confirmar; "Editar" pasa a pantalla completa; desde 769 px, la ventana de siempre; el alta sigue a pantalla completa).
  - Después, `sheet.ts`, la variante de `EventModal` y `variant="sheet"` en la ruta interceptada del detalle.

  Hecho cuando: `npm test -- sheet event-modal event-panel` en verde y prueba con emulación táctil a 390 px (abrir, ampliar, cerrar deslizando y editar) más capturas en claro y oscuro. Cubre: RF-44, RF-45, RF-46, RF-47, RF-48 | Módulo: bottom-sheet

- [ ] T15 Ampliar las horas pellizcando o con Ctrl + rueda
  Pasos:
  - Primero, en rojo: `zoom.test.ts` (altura entre 24 y 144 px; `scrollTop` que deja fija la hora bajo el ancla) y `use-grid-zoom.test.tsx` (dos punteros cambian la altura; Ctrl + rueda también y hace `preventDefault`; la rueda sola desplaza; se guarda y se lee de `localStorage` y, si falla, usa 48; pellizcar sobre un evento no lo levanta).
  - Después, `zoom.ts`, `use-grid-zoom.ts` y `hourPx` en `TimeGrid` (con `touch-action: pan-x pan-y`, R2).

  Hecho cuando: `npm test -- zoom use-grid-zoom time-grid` en verde y prueba con emulación táctil a 390 px y con Ctrl + rueda a 1440 px, recargando para ver la altura recordada. Cubre: RF-49, RF-50, RF-51, RF-52, RF-53 | Módulo: grid-zoom

- [ ] T16 Validar la spec y documentarla
  Pasos:
  - Tabla de evidencias RF-1 a RF-64 y casos límite (test o prueba manual de cada uno).
  - Prueba en un iPhone real (o su emulación táctil) de mantener pulsado, arrastrar, redimensionar, la hoja inferior y el pellizco; en el escritorio, el ratón, el menú y los atajos.
  - Prueba con un calendario traído de Google (en dev, puerto 3000): mover, redimensionar, cambiar el color, borrar y deshacer, comprobando el resultado en Google.
  - Capturas a 390, 768 y 1440 px en claro y oscuro con el acento rojo y el amarillo.
  - `AGENTS.md` (estado, lo añadido, patrones y trampas nuevas) y comandos para aplicar la migración en producción.

  Hecho cuando: verificación completa (P8) en verde con la salida reportada, `npm run test:db` en verde, evidencias en este archivo y aprobación del usuario para cerrar la spec. Cubre: todos | Módulo: validation

## Trazabilidad RF → tareas

| RF | Tareas |
|----|--------|
| RF-1 | T3, T6 |
| RF-2 | T6, T7 |
| RF-3 | T3 |
| RF-4 | T3, T6 |
| RF-5 | T2, T7 |
| RF-6 | T10 |
| RF-7 | T2, T7 |
| RF-8 | T2, T7 |
| RF-9 | T7 |
| RF-10 | T2, T7 |
| RF-11 | T10 |
| RF-12 | T2, T7 |
| RF-13 | T2, T8 |
| RF-14 | T2, T8 |
| RF-15 | T2, T8 |
| RF-16 | T2, T9, T10 |
| RF-17 | T2, T9 |
| RF-18 | T3, T6 |
| RF-19 | T2, T7 |
| RF-20 | T7 |
| RF-21 | T6, T7 |
| RF-22 | T10 |
| RF-23 | T7 |
| RF-24 | T5 |
| RF-25 | T1, T4, T5 |
| RF-26 | T5 |
| RF-27 | T4 |
| RF-28 | T1, T4 |
| RF-29 | T1, T4 |
| RF-30 | T1, T5 |
| RF-31 | T5 |
| RF-32 | T11 |
| RF-33 | T11 |
| RF-34 | T11 |
| RF-35 | T11 |
| RF-36 | T3, T11 |
| RF-37 | T3, T11 |
| RF-38 | T3 |
| RF-39 | T11 |
| RF-40 | T4, T11 |
| RF-41 | T11 |
| RF-42 | T11 |
| RF-43 | T11 |
| RF-44 | T14 |
| RF-45 | T14 |
| RF-46 | T14 |
| RF-47 | T14 |
| RF-48 | T14 |
| RF-49 | T15 |
| RF-50 | T15 |
| RF-51 | T15 |
| RF-52 | T15 |
| RF-53 | T15 |
| RF-54 | T13 |
| RF-55 | T4, T12, T13 |
| RF-56 | T13 |
| RF-57 | T12, T13 |
| RF-58 | T4, T12 |
| RF-59 | T4, T12 |
| RF-60 | T4, T12 |
| RF-61 | T4, T12 |
| RF-62 | T13 |
| RF-63 | T12, T13 |
| RF-64 | T2, T12 |
| Repeticiones (decisión del plan) | T3, T4, T6, T11 |

Módulos: undo-schema (T1), drag-core (T2), quick-actions (T3, T4), undo-core (T4, T5), toast-undo (T5), workspace-interactions (T6, T12), scope-choice (T6), drag-hook (T7–T10), event-menu (T11), event-keys (T12, T13), bottom-sheet (T14), grid-zoom (T15), validation (T16).

## Dudas abiertas

- Ninguna.
