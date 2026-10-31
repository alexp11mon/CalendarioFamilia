# Tasks 014 - Comentarios en los eventos

> Estado: **Aprobadas** por el usuario (2026-10-31).
> Spec: `specs/014-comentarios-en-eventos/spec.md` (aprobada el 2026-10-29). Plan: `specs/014-comentarios-en-eventos/plan.md` (aprobado el 2026-10-31).
> 11 tareas en una iteración: base de datos (T1–T2), lógica pura y lectura (T3–T4), escritura (T5), interfaz (T6–T10) y validación (T11).
> Reglas:
>
> - Una tarea cada vez, con el test primero (rojo → verde).
> - Al cerrar cada tarea se ejecuta y se reporta `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`. Si toca esquema, RLS o datos, también `npm run test:db -- <filtro>` (por tandas si salta el límite de Auth).
> - Si toca interfaz: capturas a 390, 768 y 1440 px en tema claro y oscuro, con el acento rojo y el amarillo (P9).
> - Un commit por tarea, citándola, en la rama `014-comentarios-en-eventos`.
>
> Sin dependencias nuevas (P6). Migraciones: solo nuevas, con `npm run db:push` (dev) y `npm run db:types`. Producción la aplica el usuario al cerrar.

## Tareas

- [x] T1 Crear la tabla de comentarios con sus permisos
  Pasos:
  - Primero, `tests/integration/event-comments.test.ts` en rojo. Comprueba:
    - matriz por rol: propietario, Editor y Lector leen y comentan; un ajeno y `anon` no ven nada ni insertan; nadie inserta con `author_id` de otro;
    - el autor edita su `body` y se pone `edited_at`; nadie edita el de otro (0 filas); cambiar `event_id`, `author_id` o `created_at` da `42501`;
    - borra el autor; el propietario borra el de cualquiera; el Editor y el Lector no borran lo ajeno; en un calendario sin propietario nadie borra lo ajeno;
    - un expulsado deja de leerlos y sus comentarios siguen para los demás;
    - el texto se guarda recortado y con los saltos interiores; vacío o de solo espacios y de 1.001 caracteres fallan; 1.000 se acepta;
    - dos inserciones con el mismo `client_id` del mismo autor dan `23505`;
    - comentar la fila de una serie da `22023`; una excepción, funciona; un evento de un calendario traído, también;
    - `list_tables_without_rls()` sigue vacía.
  - Después, la migración `event_comments` según "Modelo de datos" del plan (tabla, índices, RLS, `grant update (body)` y el trigger `event_comments_rules`).

  Hecho cuando: `npm run test:db -- event-comments schema` en verde y `src/types/database.ts` con la tabla nueva. Cubre: RF-7, RF-9, RF-10, RF-13, RF-14, RF-15, RF-16, RF-17, RF-22, RF-23, RF-24, RF-28 | Módulo: comments-schema
  Evidencia (2026-10-31): rojo antes de la migración (17 tests). Migración `20261031140000_event_comments.sql` aplicada en dev y tipos regenerados. `test:db -- event-comments` 17 tests y `schema` 37 tests en verde. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` 1738 tests.

- [x] T2 Conservar o borrar los comentarios con su evento y contarlos en las pérdidas de una serie
  Pasos:
  - Primero, casos nuevos en `event-comments.test.ts` en rojo:
    - borrar el evento, el calendario o la serie borra sus comentarios;
    - `sync_apply_events` que quita un evento traído borra sus comentarios;
    - mover el evento a otro calendario y `merge_calendars` los conservan;
    - `copy_calendar_for_owner` los copia a cada copia con su autor, `created_at` y `edited_at`;
    - `sync_attach_uploaded` conserva los de las excepciones que pasan a sueltos;
    - `series_loss` devuelve `comments` con los de las excepciones afectadas.
  - Después, la migración `comments_copy_loss` (`copy_calendar_for_owner` y `series_loss`).

  Hecho cuando: `npm run test:db -- event-comments event-series` en verde. Cubre: RF-18, RF-19, RF-26, RF-27, RF-28 | Módulo: comments-copy, comments-schema
  Evidencia (2026-10-31): rojo en la copia y en `series_loss` (2 de 24 tests). Migración `20261031150000_comments_copy_loss.sql` aplicada en dev y tipos regenerados; `event-series.test.ts` actualizado con la columna `comments`. `test:db -- event-comments event-series event-images` y `orphan` en verde. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` 1738 tests.

- [x] T3 Escribir la lógica pura de los comentarios
  Pasos:
  - Primero, `tests/unit/comments-core.test.ts` en rojo:
    - `commentBodySchema`: recorta los extremos, conserva los saltos de línea, rechaza vacío y más de 1.000 con mensaje en español, acepta emojis y otros idiomas;
    - `linkify`: separa los `https://` (también al final de una frase, sin el punto final), deja como texto `http://`, `javascript:` y las etiquetas HTML;
    - `relativeTime` en la zona del perfil: "ahora", "hace 5 min", "hace 2 h", "ayer a las 18:30" y fecha corta más antigua; `fullDateTime` con la fecha completa;
    - `commentErrorMessage` traduce `42501`, `23503`, `22023`, `P0001` del `check` y el error de red.
  - Después, `src/lib/comments/limits.ts`, `schemas.ts`, `linkify.ts`, `relative-time.ts` y `error-messages.ts`.

  Hecho cuando: `npm test -- comments-core` en verde. Cubre: RF-2, RF-9, RF-10, RF-11, RF-12 | Módulo: comments-core
  Evidencia (2026-10-31): rojo sin los módulos. `npm test -- comments-core` 16 tests en verde. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` 190 archivos y 1754 tests.

- [x] T4 Leer los comentarios de un evento por páginas
  Pasos:
  - Primero, `tests/integration/comment-queries.test.ts` en rojo, con `listComments`:
    - orden cronológico, los 50 más recientes y `hasOlder`; `before` trae los anteriores; `since` trae todo desde ese comentario e incluye lo editado y sin lo borrado;
    - autor con su nombre, "un antiguo miembro" si salió y "Cuenta borrada" si borró la cuenta, sin email en ningún campo;
    - `edited`, `canEdit` solo del autor y `canDelete` del autor y del propietario;
    - el id de una repetición sin fila devuelve una lista vacía; el de una con fila, sus comentarios.
  - Después, `src/lib/comments/queries.ts`.

  Hecho cuando: `npm run test:db -- comment-queries` en verde. Cubre: RF-1, RF-2, RF-3, RF-4, RF-6, RF-16, RF-17, RF-21, RF-24, RF-28 | Módulo: comments-queries
  Evidencia (2026-10-31): rojo sin `queries.ts`. `test:db -- comment-queries` 6 tests en verde. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` 1754 tests.

- [x] T5 Crear las acciones de cargar, comentar, editar y borrar
  Pasos:
  - Primero, `tests/unit/comment-actions.test.ts` en rojo, con Supabase simulado:
    - `addComment` valida el texto (`fieldError`), inserta con el `client_id` y devuelve la lista; `23505` cuenta como éxito;
    - con el id de una repetición sin fila comprueba la fecha y llama a `materialize_occurrence` antes de insertar; una fecha que no es una repetición da error;
    - evento borrado → `gone: true` y "Este evento ya no existe"; calendario que ya no se ve → "Ya no tienes acceso";
    - `editComment` y `deleteComment` con 0 filas explican el motivo; `loadComments` pasa `before` y `since`;
    - un id inválido se rechaza sin llamar a Supabase.
  - Después, `src/app/dashboard/events/comment-actions.ts`.

  Hecho cuando: `npm test -- comment-actions` en verde. Cubre: RF-7, RF-8, RF-10, RF-12, RF-13, RF-14, RF-15, RF-16, RF-28 | Módulo: comments-actions
  Evidencia (2026-10-31): rojo sin `comment-actions.ts`. `npm test -- comment-actions` 17 tests en verde. Desviación menor del contrato: las escrituras reciben además `since` (el comentario más antiguo cargado) para devolver la lista como la muestra la sección. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` 1771 tests.

- [x] T6 Pintar un comentario con su autor, su fecha y sus enlaces
  Pasos:
  - Primero, `tests/unit/comment-item.test.tsx` en rojo:
    - avatar, nombre, texto con saltos de línea, `<time>` con la fecha relativa y la completa accesible, "(editado)";
    - un `https://` es un enlace con `target="_blank"` y `rel="noopener noreferrer"`; `<b>hola</b>` se ve tal cual;
    - "Editar" solo con `canEdit` y "Borrar" solo con `canDelete`; editar en línea con las reglas del texto y "Cancelar"; borrar pide confirmación.
  - Después, `src/components/comments/comment-text.tsx` y `comment-item.tsx`.

  Hecho cuando: `npm test -- comment-item` en verde. Cubre: RF-2, RF-4, RF-11, RF-14, RF-15, RF-16, RF-17 | Módulo: comments-ui
  Evidencia (2026-10-31): rojo sin los componentes. `npm test -- comment-item` 9 tests en verde. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` 192 archivos y 1780 tests. Las capturas de la sección se hacen en T11.

- [x] T7 Añadir el formulario "Comentar"
  Pasos:
  - Primero, `tests/unit/comment-form.test.tsx` en rojo:
    - etiqueta visible, botón "Comentar" con `min-h-11`, error junto al campo (`aria-describedby`) si está vacío o pasa de 1.000, contador al acercarse al límite;
    - al enviar llama a la acción con un `client_id` nuevo, vacía el campo si va bien y conserva el texto con el error si falla;
    - el botón se desactiva mientras envía; Ctrl/⌘+Intro envía.
  - Después, `src/components/comments/comment-form.tsx`.

  Hecho cuando: `npm test -- comment-form` en verde. Cubre: RF-7, RF-8, RF-9, RF-10, RF-12 | Módulo: comments-ui
  Evidencia (2026-10-31): rojo sin el componente. `npm test -- comment-form` 8 tests en verde (y `comments-core` con "1.000": es-ES no agrupa cuatro cifras, ahora `formatCount`). Un reintento del mismo texto reutiliza el `client_id`. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` 1788 tests.

- [x] T8 Mostrar la sección "Comentarios" en el detalle
  Pasos:
  - Primero, `tests/unit/event-comments.test.tsx` en rojo y casos en `event-detail.test.tsx`:
    - esqueleto mientras carga, lista en orden, "Ver anteriores" añade los antiguos arriba, "Aún no hay comentarios";
    - un comentario nuevo se añade al final; `gone` cierra el detalle con el aviso;
    - la sección sale en el detalle de la ventana y de la página completa, también para un Lector y en un evento traído.
  - Después, `src/components/comments/event-comments.tsx`, `comments-skeleton.tsx` y su sitio en `EventDetail`.

  Hecho cuando: `npm test -- event-comments event-detail` en verde. Cubre: RF-1, RF-6, RF-7, RF-8, RF-13 | Módulo: comments-ui
  Evidencia (2026-10-31): rojo sin la sección. `npm test -- event-comments event-panel event-detail` en verde (8 de la sección y 2 nuevos en `event-panel.test.tsx`: ventana y página, también para un Lector). La sección va en `EventPanel`, que usan la ventana y la página completa, también con eventos traídos. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` 1798 tests.

- [x] T9 Actualizar los comentarios abiertos cada 20 segundos
  Pasos:
  - Primero, casos en `event-comments.test.tsx` en rojo, con temporizadores simulados:
    - con la pestaña visible pide `since` cada 20 s y añade, cambia o quita lo que llega; oculta no pide nada y al volver pide al momento;
    - los comentarios nuevos de otros se anuncian en una región `aria-live` sin mover el foco;
    - un comentario en edición que desaparece cierra la edición con "Este comentario ya no existe";
    - al desmontar (o al ocultar la ruta Activity) se para el sondeo.
  - Después, el sondeo en `event-comments.tsx`.

  Hecho cuando: `npm test -- event-comments` en verde. Cubre: RF-20, RF-21 | Módulo: comments-ui
  Evidencia (2026-10-31): rojo con 4 casos nuevos de sondeo. `npm test -- event-comments` 13 tests en verde: cada 20 s con la pestaña visible, nada oculta y al momento al volver, anuncio en `aria-live` sin mover el foco, edición cerrada con "Este comentario ya no existe" y sin sondeo al desmontar. typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` 1803 tests (`agenda-view` falló una vez con la máquina cargada y pasa al repetir).

- [x] T10 Marcar en las vistas los eventos con comentarios y avisar de los que se perderían en una serie
  Pasos:
  - Primero, en rojo:
    - `event-block.test.tsx` y `to-view-events.test.ts`: icono con el número y "N comentarios" para lectores de pantalla, con las reglas de cabida de las imágenes;
    - `event-series.test.ts` (o `comment-queries.test.ts`): `getEventsInRange` devuelve `commentCount` de sueltos y excepciones;
    - `series-scope-dialog.test.tsx` y `series-actions.test.ts`: `lossText` y la acción incluyen los comentarios ("Se perderán 2 cambios, 3 imágenes y 4 comentarios.").
  - Después, `commentCount` en `getEventsInRange` y `to-view-events`, `CommentIcon`, `EventBlock`, `lossText` y la lectura de `series_loss` en las acciones.

  Hecho cuando: `npm test -- event-block to-view-events series-scope-dialog series-actions` y `npm run test:db -- comment-queries` en verde. Cubre: RF-5, RF-28 | Módulo: comments-marks
  Evidencia (2026-10-31): rojo en 11 casos de `event-block`, `to-view-events`, `series-scope-dialog` y `series-actions`. `npm test -- event-block to-view-events series-scope-dialog series-actions event-detail event-form` 102 tests y `test:db -- comment-queries event-series` 41 tests en verde (`getEventsInRange` cuenta los de sueltos y excepciones). typecheck, format y build correctos, lint con los 2 avisos previos, `npm test` 1812 tests.

- [ ] T11 Validar la spec RF por RF
  Pasos:
  - Tabla de evidencias RF-1 a RF-28 en este archivo, con el test que cubre cada uno.
  - Verificación completa y `npm run test:db` entero.
  - Prueba manual con dos usuarios (propietario y Lector) en `next start -p 3100`, a 390 y 1440 px: comentar, ver el del otro sin recargar, editar, borrar, borrar lo ajeno como propietario, enlaces, repetición, evento traído, duplicar sin comentarios y salir del calendario.
  - Capturas a 390, 768 y 1440 px en claro con acento rojo y en oscuro con amarillo; borrar los usuarios de prueba.
  - Actualizar `AGENTS.md`.

  Hecho cuando: tabla de evidencias completa, verificación con la salida reportada y aprobación del usuario para cerrar. Cubre: todos | Módulo: validation

## Trazabilidad RF → tareas

| RF | Tareas |
|----|--------|
| RF-1 | T4, T8 |
| RF-2 | T3, T4, T6 |
| RF-3 | T4 |
| RF-4 | T4, T6 |
| RF-5 | T10 |
| RF-6 | T4, T8 |
| RF-7 | T1, T5, T7, T8 |
| RF-8 | T5, T7, T8 |
| RF-9 | T1, T3, T7 |
| RF-10 | T1, T3, T5, T7 |
| RF-11 | T3, T6 |
| RF-12 | T3, T5, T7 |
| RF-13 | T1, T5, T8 |
| RF-14 | T1, T5, T6 |
| RF-15 | T1, T5, T6 |
| RF-16 | T1, T4, T5, T6 |
| RF-17 | T1, T4, T6 |
| RF-18 | T2 |
| RF-19 | T2 |
| RF-20 | T9 |
| RF-21 | T4, T9 |
| RF-22 | T1 |
| RF-23 | T1 |
| RF-24 | T1, T4 |
| RF-25 | T11 (duplicar no copia: `load-new-event` no lee comentarios) |
| RF-26 | T2 |
| RF-27 | T2 |
| RF-28 | T1, T2, T4, T5, T10 |

Módulos: comments-schema (T1, T2), comments-copy (T2), comments-core (T3), comments-queries (T4), comments-actions (T5), comments-ui (T6–T9), comments-marks (T10), validation (T11).

## Dudas abiertas

- Ninguna.
