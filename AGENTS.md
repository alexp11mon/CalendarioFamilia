<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CaFam — guía para agentes

Contexto completo del proyecto para cualquier IA que empiece a trabajar en él. Léelo entero antes de tocar código. El bloque de arriba lo gestiona `next dev`: no lo edites; todo lo de debajo es documentación del proyecto y `next dev` lo respeta.

> Última actualización: 2026-11-01, al cerrar la spec 014 (comentarios), con sus 2 migraciones aplicadas en prod.

## 1. Qué es

**CaFam** es una PWA de calendario compartido, mobile-first e instalable en iOS, Android y escritorio, para uso **estrictamente personal** entre familia y amigos. Cada usuario se registra, ve sus calendarios en un panel, crea eventos, los comparte con roles Lector/Editor (por enlace o por ID y PIN) e importa calendarios externos (Google, iCloud, Outlook) desde un enlace o archivo `.ics`.

- **Nombre único: CaFam** en todas partes (constitución, enmienda 3). Los nombres anteriores del proyecto (listados en la spec 010) no se usan; los impide `tests/unit/project-name.test.ts`. Solo se conservan la URL de Vercel y las migraciones ya aplicadas.
- Sin ánimo de lucro, sin publicidad ni analítica, y **coste cero**: solo capas gratuitas (Supabase Free, Vercel Hobby, GitHub Free, Brevo y, desde la 015, un proveedor LLM gratuito).
- Producción: <https://calendario-familia-five.vercel.app>
- Repositorio (privado): <https://github.com/alexp11mon/CaFam> (renombrado en la spec 010; GitHub redirige el nombre anterior)
- Idioma: **español** en todo lo visible para el usuario, docs, specs y mensajes de commit; **inglés** en identificadores, nombres de archivos y comentarios técnicos.

## 2. Estado actual

| Spec | Alcance | Estado |
|------|---------|--------|
| 001-base-aplicacion | Proyecto base, auth email/contraseña, esquema con RLS, panel esqueleto, PWA, despliegue | **Cerrada** (2026-10-21), T1–T12 hechas |
| 002-calendarios-y-eventos | CRUD de calendarios, categorías y eventos; vistas mensual, semanal y diaria; filtros por persona con orden guardado; juntar calendarios | **Cerrada** (2026-10-21), T1–T12 hechas |
| 003-comparticion | Enlace de invitación, ID de calendario + PIN, roles Lector/Editor, lista de miembros, aviso al juntar | **Cerrada** (2026-10-22), T1–T12 hechas |
| 004-importacion-ics | Importación única de un `.ics` (enlace o archivo) a un calendario propio editable y compartible | **Cerrada** (2026-10-22), T1–T11 hechas |
| 005-identidad-visual | Identidad visual propia en todas las pantallas, acento elegido por el usuario (6 colores), marco con barra lateral e inferior, vista agenda, mini calendario y próximo evento | **Cerrada** (2026-10-22), T1–T13 hechas |
| 006-gestion-de-cuenta | Recuperar y cambiar contraseña, cambiar email, editar perfil, borrar cuenta con calendarios sin propietario, autor del evento | **Cerrada** (2026-10-23), T1–T26 hechas; aplicada y validada en producción |
| 007-sincronizacion-oauth | Sincronización de solo lectura (proveedor → CaFam) con **Google** por OAuth 2.0, actualización automática y manual, y grupos de calendarios. Microsoft se quitó el 2026-10-27 (Enmienda 1: exige tarjeta); la bidireccional y Microsoft quedan para una versión futura | **Cerrada** (2026-10-28), T1–T15 hechas; aplicada y validada en producción con la aplicación de Google en "Prueba" (Enmienda 2; publicada desde la 009) |
| 008-mejoras-de-experiencia | Calendario al estilo Google Calendar (analizado con REA): ventana de evento sobre el calendario, ventana rápida, arrastrar para crear, selector de hora, atajos, vista recordada, avisos y esqueletos | **Cerrada** (2026-10-24), T1–T23 hechas; aplicada y validada en producción |
| 009-sincronizacion-bidireccional | Escribir en Google lo que se crea, cambia, mueve o borra en los calendarios traídos (propietario y Editores), renombrar, crear y subir calendarios, política de privacidad y publicar la aplicación de Google | **Cerrada** (2026-10-29), T1–T14 hechas; aplicada y validada en producción, con la aplicación de Google publicada sin verificar |
| 010-renombrar-cafam | Renombrar todo el proyecto a CaFam (interfaz, PWA, correos, configuración, tests, documentación, specs cerradas y repositorio) | **Cerrada** (2026-10-29), T1–T8 hechas; migración `rename_cafam` aplicada en prod, paneles de correo revisados y repositorio renombrado |
| 011-rediseno-visual | Modo oscuro con selector, transparencias (glassmorphism), animaciones, microinteracciones y transiciones entre vistas | **Cerrada** (2026-10-30), T1–T13 hechas; migración `profile_theme` aplicada en prod |
| 012-imagenes-en-eventos | Imágenes en los eventos con Supabase Storage, también de Lectores y en calendarios traídos de Google | **Cerrada** (2026-10-30), T1–T13 hechas; migraciones aplicadas en prod |
| 013-eventos-recurrentes | Eventos repetidos con reglas personalizables y edición de una repetición, de las siguientes o de toda la serie | **Cerrada** (2026-10-31), T1–T16 hechas; 6 migraciones aplicadas en prod |
| 014-comentarios-en-eventos | Comentarios en los eventos por cualquier miembro, Lectores incluidos | **Cerrada** (2026-11-01), T1–T11 hechas; 2 migraciones aplicadas en prod |
| 015-asistente-de-chat | Asistente de chat sobre los eventos y la disponibilidad común, con un proveedor LLM gratuito (no Gemini) | **Spec aprobada** (2026-10-29), sin plan |
| 016-calendario-estilo-google | Calendario como Google Calendar en el móvil: bloques rellenos, cabecera con cajón y "+", deslizar, agenda continua y fila de meses (enmienda 4 de la constitución) | **Cerrada** (2026-10-30), T1–T13 hechas; sin migraciones. La prueba en el iPhone se hace en producción |
| 017-mover-eventos-y-menu | Mover y redimensionar arrastrando, menú contextual en el ordenador, "Deshacer" en los avisos, detalle en hoja inferior en el móvil, pellizcar para ampliar y atajos nuevos (enmienda 5) | **Spec aprobada** (2026-10-30), sin plan; va después de la 016 |

Las specs 001–004 (cerradas, no se editan) citan la gestión de cuenta como "spec 005" y OAuth como "spec 006": hoy son la 006 y la 007.

Lo que hay hoy: registro, login, logout, protección de rutas, portada, pantalla offline, PWA instalable y cron de keep-alive (spec 001), y además (spec 002):

- Panel con los calendarios en el orden guardado por el usuario, con accesos a crear, editar, categorías y juntar.
- CRUD de calendarios (nombre, descripción, color de una paleta pastel cerrada) y de categorías por calendario.
- CRUD de eventos (hora, día completo, varios días, descripción, lugar, color propio y categoría).
- Vistas mensual, semanal y diaria que mezclan todos los calendarios, con panel de filtros por persona → calendario → categoría. La visibilidad y el orden se guardan por usuario.
- Juntar calendarios propios en uno (fusión real, irreversible, con confirmación).

Añadido por la spec 003:

- Compartir por **enlace** (`/dashboard/calendars/[id]/share`): rol Lector o Editor, 1 a 20 usos, caduca a los 7 días, se muestra una sola vez y se puede revocar. La ruta pública `/invite/[token]` enseña una vista previa y solo se une al pulsar "Unirme".
- Compartir por **ID y PIN**: ID de 8 caracteres y PIN de 6 a 10 dígitos que elige el propietario (nadie puede volver a verlo), con límite de 5 fallos por persona y 20 por ID cada 15 minutos. Se usa en `/dashboard/join`.
- Lista de miembros (`/members`, solo nombre y rol, nunca email): el propietario cambia roles y expulsa; los demás pueden salir. El propietario no puede salir ni ser expulsado.
- Al juntar calendarios, la confirmación nombra a quien pierde el acceso y a quien pasa a ver eventos de otros calendarios.

Añadido por la spec 004 (`/dashboard/import`):

- Importar un `.ics` **una sola vez**, desde un enlace (`https://` o `webcal://`) o un archivo, y crear un calendario **nuevo** del usuario, editable y compartible. No se guarda el enlace ni el archivo y no se vuelve a sincronizar.
- Cada repetición de un evento repetido se crea como evento suelto (la app no tiene recurrentes propios): las series sin fin llegan hasta 1 año desde el día de la importación, y se respetan `EXDATE` y las repeticiones modificadas (`RECURRENCE-ID`). Los eventos cancelados no se importan.
- Límite de **2 MB y 2.000 eventos**. Los eventos con zona horaria no reconocida (típicamente los nombres de Windows de Outlook) o con fin anterior al inicio se omiten y se cuentan en el resumen.

Añadido por la spec 005:

- **Identidad visual propia** (constitución P9): fondo piedra, paneles papel, tinta casi negra, Inter Tight, botones negros redondos e iconos SVG propios. Una guardia de diseño (`tests/unit/design-tokens.test.ts`) impide volver a colores sueltos, `bg-white`, monoespaciada, degradados, sombras en reposo o emojis.
- **Color de acento** a elegir en **Ajustes** (`/dashboard/settings`) entre rojo (por defecto), azul, verde, amarillo, morado y gris. Se guarda en `profiles.accent` y se ve igual en todos los dispositivos; sin sesión, rojo. Solo marca hoy, la hora actual, los días de la semana, la vista elegida y el próximo evento.
- **Marco de la app** (`src/app/dashboard/layout.tsx`): barra lateral de iconos desde 1024 px; por debajo, barra inferior con Calendario, Mis calendarios, "+ Evento" y la hoja "Más" (Unirme, Importar, Ajustes, Cerrar sesión).
- **El calendario es la pantalla de inicio**: `/dashboard` redirige a `/dashboard/calendar` y la lista de calendarios pasa a `/dashboard/calendars` ("Mis calendarios").
- **Vista agenda** (por defecto): 14 días seguidos desde la fecha, con el número del día gigante, filas de evento (horas, barra de color, título, lugar), "Sin eventos", crear en cada día y la línea de la hora actual.
- **Panel del calendario**: tarjeta "Próximo evento" con cuenta atrás (siguiente evento con hora en 24 h), mini calendario mensual con puntos por calendario y filtros con avatares de iniciales.
- **Marca e iconos nuevos** ("CF" en piedra sobre tinta) y PWA en color piedra.

Añadido por la spec 006:

- **Recuperar contraseña** desde `/login` ("¿Olvidaste tu contraseña?" → `/forgot-password`): la respuesta es la misma exista o no la cuenta, con un límite de 3 enlaces cada 15 minutos por cuenta. El enlace del correo pasa por `/auth/confirm` y lleva a `/reset-password`; al guardar se cierran las demás sesiones.
- **Ajustes** (`/dashboard/settings`): perfil (nombre y zona horaria), cambio de email (pide la contraseña; queda pendiente hasta confirmar el enlace del email nuevo), cambio de contraseña (verifica la actual y cierra las demás sesiones) y borrar cuenta (email y contraseña).
- **Borrar la cuenta** borra los calendarios propios sin otros miembros. Los compartidos quedan **sin propietario** 15 días: sus miembros reciben un aviso en "Mis calendarios" y por correo, y deciden **Conservar** o **Salir**. Al decidir todos o vencer el plazo: con un solo conservador pasa a ser suyo; con varios, cada uno recibe una copia completa (con los autores originales); sin nadie, se borra. Mientras tanto aparecen en un grupo **"Sin propietario"** de los filtros y de "Mis calendarios", con los permisos de cada miembro sin cambios.
- **Autor del evento**: el detalle muestra "Creado por <nombre>", "Cuenta borrada" si el autor ya no existe y "un antiguo miembro" si salió del calendario.
- **Correo**: Brevo (plan gratuito, 300 al día). Auth envía recuperación y cambio de email por SMTP; los avisos de cuenta salen de Postgres con `pg_net` a la API de Brevo, con la clave en Vault.

Añadido por la spec 008 (comportamiento estudiado en Google Calendar con REA; análisis en `specs/008-mejoras-de-experiencia/analisis-google-calendar.md`):

- **Ventana de evento sobre el calendario** (rutas interceptadas `@modal`): "+ Evento", "Nuevo evento", "Crear" de la agenda y la tecla N abren el alta; pulsar un evento abre su detalle con **Editar**, **Duplicar** y **Borrar**. Botón de pantalla completa (siempre a pantalla completa a ≤ 768 px), Escape y "Cerrar" vuelven atrás, y si hay cambios sin guardar se pide confirmación. Guardar o borrar cierra la ventana en la misma vista y fecha. Una recarga o un enlace a `/dashboard/events/...` muestran la página completa.
- **Ventana rápida junto al hueco**: pulsar un día vacío del **mes** crea un evento de **día completo** (con "Añadir hora"); pulsar una franja de **semana o día** propone esa media hora y 1 h; **arrastrar con el ratón** dibuja el intervalo en pasos de 15 min (Escape cancela; con el dedo no se arrastra, un toque es un clic). Lleva título, día, horas y calendario (con su color), "Guardar" y "Más opciones" (pasa lo escrito al formulario completo). En el móvil es una hoja inferior. Mientras está abierta, el hueco se marca con un bloque discontinuo con el título que se escribe.
- **Horas con lista** (`TimeField`): de 00:00 a 23:30 cada 30 min, se pueden escribir a mano; la de fin empieza en la de inicio, muestra la duración ("11:00 (1 h)") y se mueve con el inicio hasta que se toca a mano, sin pasar de las 23:59.
- **Atajos**: N (nuevo), T (hoy), ← → (periodo), A, M, S, D (vistas); nunca con modificadores, escribiendo o con una ventana abierta. Los botones de vista muestran su tecla.
- **Vista recordada** en `profiles.last_view`: `/dashboard/calendar` sin `?view` abre la última vista con la fecha de hoy.
- **Mes al estilo Google**: eventos con hora como punto + hora + título; de día completo o varios días como barra rellena del color pastel (enmienda de P9). **Rejilla** de semana y día a toda la altura de la pantalla.
- **Agenda**: botón fijo "Hora actual". **Avisos** breves ("Evento creado", "Cambios guardados", "Evento borrado"), **esqueleto** con la forma de la vista mientras carga y **actualización** al volver a la app tras más de 60 s.

**No hay** mover o redimensionar eventos arrastrando (spec 017) ni actualización de lo importado.

Añadido por la spec 007 (en producción desde el 2026-10-28). Hasta la 009 la aplicación de Google estuvo en "Prueba" (Enmienda 2); desde el 2026-10-29 está **publicada sin verificar**: conecta cualquier cuenta pasando por el aviso de "aplicación no verificada", con un tope de 100 usuarios, y la autorización ya no caduca a los 7 días:

- **Cuentas conectadas** (`/dashboard/connections`, en "Más" y en "Mis calendarios"): lista de cuentas con su estado; "Conectar Google" pasa por un aviso previo (`/new`, explica la pantalla de "app no verificada") y luego por el OAuth. Hasta 5 cuentas.
- **Ficha de la cuenta** (`/dashboard/connections/[id]`): elegir hasta 20 calendarios con casillas (al desmarcar uno se pide conservarlo o borrarlo), estado de cada calendario traído (última actualización correcta, último resumen, fallo o "ya no existe en la cuenta"), **Actualizar ahora** (como mucho cada 5 minutos) y **Desconectar** (revoca el permiso en Google y pide conservar o borrar sus calendarios, nombrando los compartidos).
- **Actualización automática** cada hora: `pg_cron` llama a `/api/sync/run`, que reconcilia los eventos desde 6 meses atrás hasta 12 meses adelante.
- **Solo lectura en la interfaz** (hasta la 009; hoy solo para las cuentas sin permiso de escritura y los calendarios que Google solo deja leer): los calendarios traídos no se ofrecen como destino al crear, editar o duplicar; el detalle de sus eventos no tiene botones y explica que vienen de Google; no se pueden juntar. En "Mis calendarios" todos los miembros ven la última actualización y solo el propietario la cuenta de origen.
- **Avisos** en "Mis calendarios": Google retiró el permiso (`sync_revoked`, con "Volver a conectar") y 3 fallos seguidos (`sync_failing`).
- **Grupos de calendarios** en "Mis calendarios" y en los filtros: crear, renombrar, borrar (los calendarios se quedan), meter cada calendario en un grupo con su selector, subir y bajar, y ocultar o mostrar todos sus calendarios a la vez ("parcialmente visible" si hay de los dos). Son privados de cada usuario y valen para cualquier calendario, también los sin propietario. El orden de los calendarios dentro de un grupo solo se cambia desde los filtros.

Añadido por la spec 009 (en producción desde el 2026-10-29):

- **Escritura en Google**: crear, cambiar, mover (solo entre calendarios de la misma cuenta) y borrar eventos de los calendarios traídos, por el propietario y los Editores, con la cuenta de Google del propietario. Primero se escribe en Google y, si lo acepta, en CaFam; si Google lo rechaza no se guarda nada (sin cola de cambios). Un `PATCH` solo envía lo que cambió. Las repeticiones se tocan una a una; nunca se envían series, invitados, color ni categoría.
- **Permisos**: conectar pide además `calendar.events` y `calendar.calendars`. `calendar_connections.can_write` dice si se concedieron; si no, la cuenta es de solo lectura y hay un aviso con "Volver a conectar" (`reconnect-notice`) en la ficha y en "Mis calendarios". Los calendarios que Google solo deja leer (`google_access = reader`) salen como "Solo lectura en Google".
- **Calendarios**: renombrar un calendario traído lo renombra en Google; en la ficha de la cuenta se crea un calendario nuevo en Google; "Subir a Google" (`/dashboard/calendars/[id]/upload`, solo propietario de un calendario normal) crea el calendario en Google con los eventos de la ventana de sincronización (hasta 2.000) y lo convierte en traído. Si algo falla a medias, se borra en Google lo que se acababa de crear: es el único caso en que CaFam borra un calendario en Google.
- **Política de privacidad** pública en `/privacy`, enlazada desde la portada y el aviso previo a conectar.



Añadido por la spec 011 (en producción desde el 2026-10-30):

- **Tema** claro, oscuro o "Como el sistema" (por defecto) en Ajustes, guardado en `profiles.theme` y en la cookie `cafam-theme` (la escriben `signIn` y `setTheme`; `signUp`, `signOut` y el proxy sin sesión la borran). Un script en `<head>` (`THEME_SCRIPT`, `lib/theme/theme.ts`) pinta `data-theme` antes del primer fotograma; sin sesión, la página sigue al sistema. Acceso directo (`ThemeToggle`) en la barra lateral y en la hoja "Más".
- **Cristal**: utilidades `glass` (barras, paneles del calendario y secciones de Ajustes) y `glass-float` (ventanas, hojas, diálogos y avisos), con respaldo opaco si no hay `backdrop-filter`. El contraste se calcula sobre el peor fondo (`lib/theme/contrast.ts`, `composite`).
- **Movimiento**: `press` en botones y controles; View Transitions de React (`<ViewTransition>`, `addTransitionType`) al cambiar de vista, periodo o filtro (`lib/calendar/transition-types.ts`); ventanas, hoja y avisos entran y salen con `@starting-style`. Todo con tokens `--motion-*` y versión reducida para `prefers-reduced-motion`.
- **El logotipo se invierte en oscuro** (piedra clara con letras en tinta); el icono de la PWA no cambia.

Añadido por la spec 012 (en producción desde el 2026-10-30):

- **Imágenes en los eventos**: "Añadir imágenes" en el detalle para **cualquier miembro, Lectores incluidos**, también en calendarios traídos de Google (las imágenes nunca se envían a Google), y en el alta completa (página y ventana). En el móvil ofrece cámara y galería.
- **En el dispositivo** cada imagen se reduce a 2048 px (y una miniatura de 400 px) y se recomprime a JPEG con canvas, lo que quita el EXIF y la ubicación. Se aceptan JPEG, PNG, WebP y HEIC/HEIF si el navegador los lee; más de 20 MB antes de reducir se rechaza. Se suben dos a la vez, con progreso, "Cancelar" y "Reintentar".
- **Límites**: 10 por evento, 300 por usuario y 800 MB en total (`images_total_limit()`), comprobados al reservar con el evento bloqueado.
- **Galería** en el detalle (miniaturas en orden de subida, `alt` "Título, imagen 2 de 5") y **visor** a pantalla completa (imagen con esquinas redondeadas y un marco fino de papel) con anterior/siguiente (botones, flechas, deslizar), autor y fecha, "Descargar" y "Borrar imagen" (quien la subió, propietario y Editores).
- **Icono** en las vistas para los eventos con imágenes (`imageCount` de `getEventsInRange`); en semana y día solo en bloques de 30 min o más.
- Borrar el evento, el calendario o la cuenta, o que la sincronización quite un evento traído, borra sus imágenes (por la cola de purga). Mover, juntar, copiar calendarios sin propietario y subir a Google las conservan; duplicar no las copia.

Añadido por la spec 016 (en producción desde el 2026-10-30, sin migraciones; comportamiento tomado de las capturas de Google Calendar en el iPhone):

- **Bloques rellenos** (`EventBlock`, formas `line`, `grid` y `card`): todos los eventos de todas las vistas son un bloque del color pastel con el texto en `pastel-ink` (4,5:1 con cada pastel) y el título en negrita. Sustituye a `EventChip` y `EventRow`, retirados.
- **Marco del móvil (≤ 768 px)**: cabecera `TopBar` en todas las pantallas del panel (menú ≡, título, "Hoy" con el número del día, avatar → Ajustes) y **sin barra inferior**. El menú abre `NavDrawer` (un `<dialog data-drawer>` desde la izquierda): en el calendario, las cuatro vistas y los filtros; después los destinos, el tema y cerrar sesión. Se cierra al elegir, en el fondo, con Escape o deslizando a la izquierda, y devuelve el foco al menú. En el calendario no hay barra de herramientas ni "Próximo evento", y hay un botón flotante "+" (`Fab`) si se puede crear. Entre 769 y 1023 px sigue la barra inferior, y desde 1024 px la lateral: el escritorio no cambia.
- **Título del calendario**: el mes visible con una flecha. En la vista mes despliega una fila de meses (`MonthStrip`, con el año entre diciembre y enero); en las demás, el mini calendario, que se pliega al elegir un día.
- **Deslizar** en mes, semana y día cambia de periodo (50 px, más horizontal que vertical, nunca con una ventana o el cajón abiertos), con la transición de la 011.
- **Mes** a toda la altura: iniciales L M X J V S D, hoy en círculo de acento, eventos en carriles de una línea (los de varios días cruzan la semana) y "+N" que lleva a la vista día.
- **Semana y día**: cabecera fija con inicial y número grande, franja de día completo, horas "9:00", bloques redondeados con título y lugar que parten el texto en varias líneas, y línea de ahora con un punto. Al abrir en hoy se desplaza a la hora actual.
- **Agenda continua en todas las anchuras**: bandas de mes con degradado (`bg-agenda-band`), separadores de semana ("2–8 de noviembre", "Sin eventos"), día a la izquierda y bloques "A las 11:15–14:15 en <lugar>". Carga tramos de 28 días al llegar a un extremo con `loadAgendaEvents` (como mucho 120 días en memoria, sin saltos al cargar hacia arriba), el título de la cabecera sigue el mes visible y "Hoy" (botón, cabecera o T) vuelve a hoy sin recargar si puede.

Añadido por la spec 013 (en producción desde el 2026-10-31):

- **"Repetir"** en el alta y la edición (`RepeatField`): "No se repite", opciones rápidas calculadas con la fecha (cada día, semana, mes por día o por posición, último, año, laborables) y "Personalizado…" (`RecurrenceEditor`: cada N días, semanas, meses o años, días de la semana, fin Nunca, El <fecha> o Tras <n>, con resumen en español). El campo envía `repeat` (`none`, el tipo de opción rápida o `custom:<RRULE>`) y el servidor lo resuelve con la fecha. Deshabilitado en calendarios traídos de Google, con su motivo.
- **Una serie es una fila** de `events` con `recurrence`; sus repeticiones se expanden al leer (`getEventsInRange`, `getEvent`) con `ical.js`, a la hora de reloj de `recurrence_tz` (la zona del perfil de quien la creó). Una repetición sin fila propia tiene el id `<uuid de la serie>_<YYYYMMDDTHHMMSSZ>` (`occurrenceId`, `parseEventId`). Una **excepción** es una fila con `series_id` y `original_start`; si no difiere de la serie solo existe para guardar imágenes y se muestra como una repetición normal.
- **Marcas**: icono de repetición con "Se repite" para lectores de pantalla donde cabe (las mismas reglas que el de imágenes, prop `icons` de `EventBlock`); el detalle muestra "Se repite" con el resumen y "Cambiado solo en este evento".
- **Alcance** al guardar o borrar una repetición (`SeriesScopeDialog`, dentro del formulario): "Solo este evento", "Este y los siguientes" y "Todos los eventos". Sin "Solo este evento" si cambió el calendario; deshabilitado a las 100 excepciones. Si se pierden cambios o imágenes, pide confirmar ("Se perderán 2 cambios y 3 imágenes." → "Guardar igualmente" / "Borrar igualmente").
- **Convertir**: un suelto pasa a serie eligiendo una regla (con imágenes, el original queda como primera repetición de una serie nueva); "No se repite" con "Todos los eventos" deja solo la primera repetición.
- **Imágenes en una repetición**: la primera imagen crea su fila (excepción idéntica) con `materialize_occurrence`; cada repetición tiene las suyas.
- **Duplicar** una repetición crea un evento suelto en su fecha. Juntar, copiar calendarios sin propietario y subir a Google conservan o convierten las series (subir: cada repetición de la ventana como evento suelto, con aviso).
- Límites: 500 series por calendario y 100 excepciones (contando las fechas borradas) por serie.

Añadido por la spec 014 (en producción desde el 2026-11-01):

- **Sección "Comentarios"** al final del detalle (`EventComments` en `EventPanel`, ventana y página completa): cualquier miembro, Lectores incluidos y también en calendarios traídos (nunca se envían a Google), escribe con "Comentar" (Ctrl/⌘+Intro también). Se cargan **después** de abrir el detalle, con su esqueleto: los 50 más recientes en orden cronológico y "Ver anteriores".
- Cada comentario: avatar, nombre ("un antiguo miembro" o "Cuenta borrada" como el autor del evento), fecha relativa ("hace 5 min", "ayer a las 18:30") con la completa para lectores de pantalla, "(editado)" y texto plano con saltos de línea; solo los `https://` son enlaces (`linkify`, nunca HTML). De 1 a 1.000 caracteres sin los espacios de los extremos.
- **Permisos**: edita solo el autor; borran el autor y el propietario del calendario (en uno sin propietario, nadie borra lo ajeno). Un expulsado deja de verlos y los suyos se quedan.
- **Actualización**: con el detalle abierto y la pestaña visible se piden cada 20 s (y al volver a la pestaña) desde el comentario más antiguo cargado, así llegan también lo editado y lo borrado; los nuevos de otros se anuncian en una región `aria-live`.
- **Marcas**: icono de bocadillo con el número y "N comentarios" para lectores de pantalla en todas las vistas, con las reglas de cabida de las imágenes.
- **Repeticiones**: comentar una repetición sin fila la materializa (`materialize_occurrence`); cada repetición tiene los suyos. El aviso de pérdidas de la 013 los cuenta ("Se perderán 2 cambios, 3 imágenes y 4 comentarios.").
- Borrar el evento (también desde la sincronización) los borra; moverlo y juntar calendarios los conservan; las copias de calendarios sin propietario los copian; duplicar no los copia.

La fuente de verdad es [`docs/constitution.md`](docs/constitution.md). Resumen de lo que más afecta a un agente:

- **Flujo SDD (P7):** no se escribe código sin `spec.md` → `plan.md` → `tasks.md` aprobados explícitamente por el usuario, en ese orden. Cada spec vive en `specs/NNN-nombre/`. Se implementa **una tarea `Tn` cada vez y con el test primero** (rojo → verde). Cada commit cita su tarea.
  - Hay skills para redactarlos: `spec-generator`, `plan-generator`, `tasks-generator` y `constitution-generator`.
- **Verificación obligatoria (P8):** ninguna tarea se da por hecha sin ejecutar y **reportar la salida** de:
  ```
  npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
  npm run test:db   # obligatorio si la tarea toca esquema, RLS o acceso a datos
  ```
  más una prueba manual en móvil (≤ 768 px) y escritorio si toca interfaz. Al cerrar una tarea se marca `[x]` en `tasks.md`.
- **Privado por defecto (P3):** toda tabla de `public` tiene RLS. La base de datos es la frontera de seguridad; el código nunca decide permisos por sí solo.
- **Secretos solo en el servidor (P4):** `SUPABASE_SECRET_KEY` y `CRON_SECRET` nunca llevan prefijo `NEXT_PUBLIC_`, nunca se importan en `src/` ni se suben a git. `tests/unit/no-secrets.test.ts` falla si `src/` menciona `SUPABASE_SECRET_KEY` o `service_role`.
- **Stack cerrado (P6):** solo las dependencias de la sección 4. Cualquier otra exige aprobación del usuario registrada en la spec que la introduce (incluidas la librería de vistas de calendario de la 002 y la de parseo `.ics` de la 004).
- **Prohibido:** servicios de pago, SDK de analítica/tracking/telemetría (GA, Sentry…), librerías PWA (`next-pwa`, Serwist, Workbox), ORMs (Prisma, Drizzle), backends paralelos, y otro gestor de paquetes que no sea npm.
- **Aprobaciones del usuario:** pasar de fase (spec → plan → tareas → implementación) y cerrar una spec exigen su aprobación explícita. No la des por supuesta.
- **Identidad visual (P9):** toda pantalla nueva o rediseñada sigue la sección "Identidad visual y diseño de interfaz" de la constitución (estilo de `docs/referencia.jpg`, solo local), usa solo tokens (la guardia `design-tokens.test.ts` lo comprueba) y se revisa con capturas a 390, 768 y 1440 px con el acento rojo y el amarillo. Para diseñar usa las skills `design-taste-frontend` (pantallas de aplicación), `frontend-design` y `web-design-guidelines`. Ver §6 "Identidad visual".
- **Enmienda 3 (2026-10-29):** la constitución ya permite tema oscuro, transparencias con desenfoque, sombras suaves, degradados suaves (siempre como tokens) y animaciones de hasta 400 ms con alternativa para `prefers-reduced-motion`; Supabase Storage; `ical.js` también para repeticiones; y un proveedor LLM gratuito sin tarjeta para el asistente, llamado con `fetch` y sin SDK. La 011 ya actualizó la guardia de diseño (`design-tokens.test.ts`): solo `shadow-soft`/`shadow-float`, cristal y sombra de flotar solo en lo que flota, sin `text-white`, `text-black` ni `dark:`, y duraciones de 400 ms como mucho.
- **Acciones externas:** el usuario ejecuta él mismo (con `!` en Claude Code) las acciones sobre producción: `supabase db push` a prod, `git push` y merges a `main`. Prepárale los comandos exactos.

## 4. Stack

| Capa | Tecnología |
|------|-----------|
| Lenguaje | TypeScript 5 `strict`, sin `any` explícito (ESLint en error); Node.js 24 |
| Framework | **Next.js 16.4** (App Router, Turbopack, Server Components, Server Actions), React 19.3 |
| Estilos | Tailwind CSS 4 vía `@tailwindcss/postcss` (`postcss.config.mjs`) |
| Datos y auth | Supabase Free: PostgreSQL 17 con RLS + Supabase Auth (email/contraseña) con `@supabase/ssr` (sesión en cookies) |
| Validación | `zod` 4 |
| Hosting | Vercel Hobby (incluye el cron diario), repo en GitHub |
| PWA | `src/app/manifest.ts` nativo + service worker propio en `public/sw.js` |
| Tests | Vitest 5 (proyectos `unit` con jsdom y `db` con node), Testing Library |
| Calidad | ESLint 9 (`eslint-config-next` + `eslint-config-prettier`), Prettier 3 |
| BD | Supabase CLI (`supabase` como devDependency) para migraciones y tipos |

Dependencias de producción: `next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`, `zod` y `ical.js` (2.2.1, MPL-2.0, aprobada en la spec 004; solo se importa en `src/lib/ics/parse-ics.ts` y, desde la 013, en `src/lib/recurrence/expand.ts`, ambos solo del servidor; `no-secrets.test.ts` lo comprueba). El `package.json` no debe crecer sin aprobación.

## 5. Estructura del repositorio

```
.
├── AGENTS.md                  # este archivo (CLAUDE.md lo importa)
├── docs/constitution.md       # principios, stack permitido/prohibido, convenciones, verificación
├── specs/NNN-nombre/          # spec.md, plan.md, tasks.md de cada spec (con trazabilidad RF → tareas → evidencia)
├── src/
│   ├── proxy.ts               # "middleware" de Next 16: refresca sesión y aplica getRouteAccess
│   ├── app/
│   │   ├── layout.tsx         # <html lang="es">, metadata (título, appleWebApp), viewport, ServiceWorkerRegister
│   │   ├── globals.css        # @import "tailwindcss" + tokens (@theme) y los seis [data-accent]
│   │   ├── page.tsx           # portada pública "/" (con sesión redirige a /dashboard/calendar) + ayuda de instalación iOS
│   │   ├── manifest.ts        # /manifest.webmanifest
│   │   ├── icon.svg           # favicon (copia de public/icons/icon.svg)
│   │   ├── (auth)/            # grupo sin segmento de URL
│   │   │   ├── actions.ts     # Server Actions signUp, signIn, signOut
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   ├── forgot-password/ # pedir enlace + actions.ts (requestRecovery) — spec 006
│   │   │   └── reset-password/  # contraseña nueva + actions.ts (resetPassword) — spec 006
│   │   ├── auth/confirm/route.ts  # verifica el token_hash de los correos de Auth (spec 006)
│   │   ├── dashboard/         # layout.tsx (marco con el acento + slot `modal`), page.tsx (redirige al calendario); protegido por getRouteAccess
│   │   │   ├── @modal/        # spec 008: default.tsx y [...catchAll] (null), (.)events/new y (.)events/[id] (ventana sobre el calendario)
│   │   │   ├── calendar/      # vistas agenda/mes/semana/día (?view=&date=) + preferences-actions.ts (incl. saveLastView) + mini-month-actions.ts + agenda-actions.ts (loadAgendaEvents, spec 016)
│   │   │   ├── calendars/     # page.tsx ("Mis calendarios"), new, [id]/edit, [id]/categories, merge + actions.ts (calendarios y juntar)
│   │   │   ├── settings/      # Ajustes: acento + actions.ts (setAccent) y cuenta + account-actions.ts (spec 006)
│   │   │   ├── connections/   # spec 007: page.tsx (lista), new (aviso previo), [id] (elegir calendarios, estado, actualizar, desconectar; `maxDuration` 60) + actions.ts (saveSelection, syncNow, disconnectAccount)
│   │   │   └── events/        # new, [id] (página completa) + actions.ts (modo `modal`) + load-new-event.ts y load-event.ts (carga compartida con la ventana)
│   │   ├── dashboard/join/    # "Unirme con código" (ID y PIN) + actions.ts
│   │   ├── dashboard/import/  # "Importar calendario" (.ics) + actions.ts (`maxDuration` 60)
│   │   ├── dashboard/calendars/[id]/share/    # invitaciones y ID/PIN (solo propietario) + actions.ts
│   │   ├── dashboard/calendars/[id]/members/  # lista de miembros (cualquier miembro) + actions.ts
│   │   ├── invite/[token]/    # vista previa y "Unirme" (ruta pública a nivel de proxy) + actions.ts
│   │   ├── offline/page.tsx   # "Sin conexión" + "Reintentar" (estática, la precachea el SW)
│   │   ├── api/oauth/[provider]/start, callback  # spec 007: inicio y vuelta del OAuth (estado en la cookie `cafam_oauth`)
│   │   ├── api/sync/run/route.ts  # spec 007: POST con Bearer CRON_SECRET; actualiza lo pendiente (`maxDuration` 60)
│   │   └── api/cron/keep-alive/route.ts  # GET protegido por CRON_SECRET
│   ├── components/
│   │   ├── ui/                # button (variantes), link-button, text-field, text-area, select, form-alert, time-field (combobox de horas), toast (avisos) (solo tokens)
│   │   ├── shell/             # app-frame, side-rail, bottom-bar (769–1023 px), more-sheet, top-bar y nav-drawer (móvil, spec 016), calendar-header (contexto de la cabecera), bar-styles, icons (SVG propios)
│   │   ├── brand/             # logo (LogoMark y Logo)
│   │   ├── settings/          # accent-picker
│   │   ├── account/           # formularios de cuenta, diálogo de borrado, avisos, calendario sin propietario (spec 006)
│   │   ├── people/            # avatar
│   │   ├── auth/              # auth-card, login-form, signup-form (Client Components con useActionState)
│   │   ├── dashboard/         # calendar-list
│   │   ├── calendar/          # formularios, vistas (agenda-view, month/week/day, time-grid, slot-layer), event-block (bloque relleno con las marcas de imágenes y de repetición), month-strip, fab, event-modal, event-panel, quick-create, gone-event, calendar-skeleton, mini-month, next-event-card, filtros, workspace, merge-form, confirm-dialog…
│   │   ├── sharing/           # invite-form, copy-button, invite-list, access-code-panel, member-list, join-code-form, invite-join-card
│   │   ├── import/            # import-form, import-summary
│   │   ├── recurrence/        # spec 013: repeat-field, recurrence-editor, series-scope-dialog, series-delete
│   │   ├── comments/          # spec 014: event-comments (sección con sondeo), comment-item, comment-text, comment-form, comments-skeleton
│   │   ├── images/            # spec 012: image-picker, upload-list, use-image-uploads (cola de subidas), image-uploader (detalle), event-images (galería), image-viewer (visor), use-image-blob
│   │   ├── connections/       # spec 007: connection-list, provider-notice, calendar-picker, sync-status, sync-now-button, disconnect-dialog
│   │   └── pwa/               # service-worker-register, retry-button, ios-install-hint
│   ├── lib/
│   │   ├── auth/              # schemas.ts (zod), error-messages.ts, form-state.ts, route-access.ts, next-path.ts (destino tras login: solo /invite/<token>)
│   │   ├── calendar/          # LÓGICA PURA testeada: palette, time-zone, ranges, layout, agenda-feed, agenda-today, month-lanes, month-strip, swipe, to-view-events, month-marks, next-event, grouping, format, schemas, error-messages, time-options, slots, popover, shortcuts, new-event-query, draft; queries.ts (lecturas con RLS)
│   │   ├── theme/             # accents.ts: los seis acentos y los neutros (fuente de los valores de globals.css)
│   │   ├── shell/             # nav.ts: destinos y sección activa
│   │   ├── people/            # avatar.ts: iniciales y tintes
│   │   ├── hooks/             # use-now.ts (reloj compartido), use-calendar-shortcuts.ts, use-refresh-on-focus.ts, use-swipe.ts, use-is-phone.ts
│   │   ├── sharing/           # schemas, error-messages, merge-access, invite-url, roles (puros) y queries.ts (lecturas con RLS)
│   │   ├── ics/               # importación .ics: limits, source-url, ip-guard, fetch-ics, read-source, parse-ics (única que importa ical.js), convert-events, import-calendar (orquesta), schemas, error-messages, import-state
│   │   ├── forms/             # form-state.ts: FormState genérico, ConfirmState, ParseResult, readString
│   │   ├── comments/          # spec 014: limits, schemas, linkify, relative-time, error-messages (puras) y queries.ts (`listComments`, `commentRowFor`)
│   │   ├── recurrence/        # spec 013: limits, schemas, rule (RRULE ↔ regla), presets, summary, occurrence-id y error-messages (puras); expand (ical.js), read-series y series-write (`seriesColumns`, `planSeriesChange`, `planSeriesDelete`), solo servidor; server-secret
│   │   ├── images/            # spec 012: paths, limits, fit, alt, error-messages (puras), prepare-image (canvas), upload-object (XHR con progreso), download-image, queries.ts, purge.ts
│   │   ├── sync/              # spec 007. Puras y testeadas: limits, window, limit-events, nearest-color, event-row, google-events, oauth-state, summary, error-messages, schemas, read-only (canWriteEvents, canMerge). Con red o BD: providers/google.ts (único cliente HTTP de Google), google-config, run-sync (motor con dependencias inyectadas), engine.ts (entrada del servidor), queries.ts (lecturas con RLS)
│   │   └── supabase/          # env.ts, server.ts, client.ts, proxy.ts
│   └── types/database.ts      # GENERADO con `npm run db:types`; no editar a mano
├── public/
│   ├── sw.js                  # service worker propio
│   └── icons/                 # icon.svg (maestro) → icon-192, icon-512, icon-512-maskable (letras al 85 %), apple-touch-icon
├── supabase/
│   ├── config.toml
│   └── migrations/            # 001: base_schema, rls_policies · 002: calendars_and_events, merge_calendars · 003: sharing_tables_and_policies, members_with_names, invite_functions, access_code_functions, fix_join_with_code · 004: import_calendar · 005: profile_accent, remove_old_blue · 006: account_orphan_schema, account_recovery_limit, delete_own_account, decide_orphan_calendar, copy_calendar_for_owner, apply_orphan_decisions, account_mail_jobs, account_notices_read, skip_test_addresses · 008: profile_last_view · 007: sync_schema, sync_readonly, sync_connect_functions, sync_worker_functions, calendar_groups · 009: sync_write_schema, sync_write_functions, sync_apply_events_v2 · 010: rename_cafam · 011: profile_theme · 012: event_images, event_images_functions, event_images_storage, event_images_purge_claim, copy_calendar_images(_fix), images_purge, reserve_images_order · 013: event_series, series_reserve_images, series_rules_fast_tz, event_series_functions, series_copy_upload, materialize_occurrence · 014: event_comments, comments_copy_loss
├── tests/
│   ├── setup-unit.ts
│   ├── fixtures/ics/          # .ics sintéticos al estilo Google, iCloud y Outlook (nunca calendarios reales)
│   ├── fixtures/sync/         # respuestas sintéticas de la API de Google Calendar (spec 007)
│   ├── unit/                  # *.test.ts(x): lógica pura, formularios, vistas, filtros, sw-no-data, no-secrets…
│   └── integration/           # schema, rls, signup, login, calendars-events, merge-calendars, preferences, profile-accent, remove-old-blue, range-performance contra Supabase dev + helpers.ts
├── vercel.json                # cron "0 6 * * *" → /api/cron/keep-alive
├── next.config.ts             # cacheComponents, partialPrefetching, cabeceras de /sw.js
├── postcss.config.mjs, eslint.config.mjs, vitest.config.ts, tsconfig.json (alias @/* → src/*)
└── .env.example               # variables documentadas sin valores
```

Nombres de archivos en kebab-case (`login-form.tsx` exporta `LoginForm`), salvo los reservados de Next (`page.tsx`, `layout.tsx`, `route.ts`, `proxy.ts`, `(grupo)`). Rutas URL en inglés.

## 6. Arquitectura

Monolito Next.js desplegado en Vercel. Server Components leen datos con la sesión del usuario, Server Actions hacen registro/login/logout y `src/proxy.ts` refresca la sesión y protege rutas. Supabase aporta Auth y Postgres, donde **RLS impone los permisos**.

```
Navegador / PWA ──cookies──▶ Vercel ─ src/proxy.ts ── refresca sesión (getClaims) + getRouteAccess()
                                    ├ Server Components ── leen con la sesión del usuario
                                    ├ Server Actions ───── signUp / signIn / signOut
                                    └ /api/cron/keep-alive ◀── Vercel Cron 06:00 UTC
                                          ▼
                             Supabase ─ Auth (auth.users) ─ trigger handle_new_user
                                      └ Postgres public.* con RLS + funciones de permiso
```

### Rutas

| Ruta | Acceso | Contenido |
|------|--------|-----------|
| `/` | pública | Portada; con sesión redirige a `/dashboard/calendar` (lo hace la página, no el proxy) |
| `/signup`, `/login` | solo sin sesión (con sesión → `/dashboard/calendar`) | Formularios; aceptan `?next=`, que solo se sigue si es `/invite/<token>` (campo oculto leído en el cliente) |
| `/dashboard` y subrutas | solo con sesión (sin sesión → `/login`) | Todas dentro del marco (`dashboard/layout.tsx`). `/dashboard` redirige a `/dashboard/calendar` |
| `/dashboard/calendar` | con sesión | Vistas `?view=agenda\|month\|week\|day&date=YYYY-MM-DD`. Sin `view`, la guardada en `profiles.last_view` (o agenda); una `view` inválida → agenda desde hoy |
| `/dashboard/calendars` | con sesión | "Mis calendarios": la lista con crear, importar, unirme y juntar |
| `/dashboard/settings` | con sesión | Ajustes: color de acento, perfil, email, contraseña y borrar cuenta (spec 006); `?confirm=invalid` avisa de un enlace de cambio de email no válido |
| `/dashboard/calendars/new`, `/[id]/edit`, `/[id]/categories`, `/merge` | con sesión | Calendarios, categorías y juntar. `edit` solo propietario, `categories` propietario o editor; otros → 404 |
| `/dashboard/events/new`, `/dashboard/events/[id]` | con sesión | Alta (`?calendar=&date=&start=&end=&allDay=1&title=&from=<id para duplicar>`) y detalle con editar, duplicar y borrar. Navegando dentro de la app se abren en la ventana (`@modal`); recarga o enlace, página completa |
| `/dashboard/calendars/[id]/share` | solo propietario (otros → 404) | Invitaciones por enlace e ID y PIN |
| `/dashboard/calendars/[id]/members` | cualquier miembro (ajeno → 404) | Lista de miembros; controles según el rol |
| `/dashboard/join` | con sesión | Unirme con ID y PIN |
| `/dashboard/import` | con sesión | Importar un `.ics` (enlace o archivo) a un calendario nuevo |
| `/dashboard/connections`, `/new?provider=google`, `/[id]` | con sesión (`[id]` ajeno → 404) | Cuentas conectadas (spec 007). `?error=cancelled\|failed\|max` muestra el fallo de la vuelta del OAuth |
| `/api/oauth/google/start`, `/api/oauth/google/callback` | con sesión | OAuth de Google: `start` guarda estado y verificador PKCE en la cookie y redirige a Google; `callback` los comprueba, guarda la cuenta (`connect_account`) y lleva a `/dashboard/connections/[id]` |
| `/api/sync/run` | `Authorization: Bearer ${CRON_SECRET}` (POST) | Lo llama `sync_trigger()` desde `pg_cron`; actualiza tandas de 4 calendarios durante como mucho 50 s |
| `/invite/[token]` | sin sesión → `/login?next=/invite/<token>`; con sesión, vista previa | Cabeceras `Referrer-Policy: no-referrer` y `X-Robots-Tag: noindex` |
| `/offline` | pública | Pantalla sin conexión |
| `/forgot-password` | pública | Pedir el enlace de recuperación (spec 006); `?expired=1` avisa de un enlace caducado |
| `/reset-password` | solo con sesión (la crea el enlace; sin sesión → `/login`) | Contraseña nueva |
| `/auth/confirm` | pública (Route Handler) | `verifyOtp` con `token_hash`: `type=recovery` → `/reset-password`, `type=email_change` → `/dashboard/settings`; nunca lee `next` |
| `/dashboard/calendars/[id]/upload` | solo propietario de un calendario normal con propietario (otros → 404) | Subir a Google (spec 009); `maxDuration` 300 |
| `/privacy` | pública | Política de privacidad (spec 009) |
| `/manifest.webmanifest`, `/sw.js`, `/icons/*` | pública | PWA |
| `/api/images/purge` | `Authorization: Bearer ${CRON_SECRET}` (POST) | Spec 012: borra en Storage los objetos de la cola de purga; `maxDuration` 60 |
| `/api/cron/keep-alive` | `Authorization: Bearer ${CRON_SECRET}` | `200 {"ok":true}` / `401` / `500` |

La decisión de acceso es una función pura, `getRouteAccess(pathname, hasSession)`, en `src/lib/auth/route-access.ts` (testeada en `route-access.test.ts`). Para proteger una ruta nueva se cambia **ahí**, no en cada página. El `matcher` de `src/proxy.ts` excluye estáticos, `sw.js` y el manifest.

### Autenticación

- `signUp` valida con `signUpSchema` (email normalizado a minúsculas sin espacios; contraseña de 8 a 72 caracteres; nombre de 1 a 50) y llama a `supabase.auth.signUp` con los metadatos `display_name` y `time_zone`. La zona horaria la detecta el navegador (`Intl`) en un campo oculto; si no es válida se descarta y Postgres aplica `Europe/Madrid`.
- **"Confirm email" está desactivado** en Supabase (desde la spec 006 hay SMTP de Brevo, pero sigue desactivado), así que el registro devuelve sesión y redirige a `/dashboard/calendar`. El registro es abierto (cualquiera con la URL).
- Los errores de Supabase se traducen en `src/lib/auth/error-messages.ts`; un código desconocido o un error de red se convierte en "No se ha podido conectar…".
- Los formularios usan `useActionState`, `noValidate` (los errores vienen del servidor en español) y desactivan el botón mientras la acción está pendiente.
- `signOut` usa `scope: "local"` y redirige a `/login`.

### Base de datos (`supabase/migrations/`)

- Enum `calendar_role`: `owner | editor | viewer` (en la UI: Propietario, Editor, Lector).
- Tablas: `profiles` (1:1 con `auth.users`: `display_name`, `time_zone`), `calendars` (`owner_id`, `name`, `description`, `color`, por defecto Azul cielo `#A0C4FF` desde la spec 005), `calendar_members` (PK `calendar_id + user_id`, `role`; **el propietario también tiene su fila `owner`**, con un solo owner por calendario) y `events` (`starts_at`/`ends_at` en `timestamptz` con `ends_at >= starts_at`, `all_day`, `created_by`). Todas tienen `created_at` y, las editables, `updated_at`.
- Triggers:
  - `handle_new_user`: crea el perfil y "Mi calendario".
  - `add_owner_membership`: crea la fila `owner`.
  - `validate_time_zone`: en INSERT aplica el respaldo `Europe/Madrid`; en UPDATE rechaza valores no válidos.
  - `prevent_owner_change` y `set_updated_at`.
- Permisos: `is_calendar_member(id)` y `calendar_role_for(id)` son `SECURITY DEFINER` con `search_path = ''` y evitan la recursión de políticas. `list_tables_without_rls()` la usa el test que garantiza P3.
- Políticas:

  | Tabla | Leer | Escribir |
  |-------|------|----------|
  | `profiles` | Solo el propio | Actualizar solo el propio |
  | `calendars` | Los miembros | Crear el usuario como owner; modificar y borrar solo el owner |
  | `calendar_members` | Los miembros | Nadie inserta ni modifica: la spec 003 añadirá RPC controladas |
  | `events` | Los miembros | Crear, modificar y borrar owner y editor |

  `anon` no ve nada.
- Convención de eventos de día completo: `all_day = true`, inicio a las 00:00 **UTC** del primer día y fin exclusivo a las 00:00 UTC del día siguiente al último. Se muestran por fecha UTC sin convertir a la zona del lector (un cumpleaños no cambia de día entre zonas, plan 002 D6). Los eventos con hora son instantes UTC que se escriben y muestran en la zona del **perfil**, que el servidor lee de la base de datos (nunca del cliente).
- Añadido por la spec 002:
  - `event_categories (calendar_id, name)`: por calendario, nombre único ignorando mayúsculas y espacios; leen los miembros, escriben propietario y editor.
  - `events.color` (opcional) y `events.category_id`. La FK compuesta `(category_id, calendar_id)` impide una categoría de otro calendario; al borrar la categoría el evento queda sin ella; un trigger la quita al mover el evento a otro calendario.
  - `calendar_preferences (user_id, calendar_id, visible, position)` y `person_preferences (user_id, person_id, position)`: privadas, filas creadas bajo demanda (sin fila = visible y al final). Los upserts parciales conservan la otra columna.
  - `visible_people()` (`SECURITY DEFINER`): `id` y `display_name` del usuario y de los propietarios de calendarios que comparte, sin zona horaria. La política de `profiles` sigue siendo "solo el propio".
  - `merge_calendars(p_source_ids, p_target_id, p_name, p_color)` (`SECURITY INVOKER`, una transacción): solo propietario de todos; unifica categorías con el mismo nombre; los miembros de los calendarios que desaparecen se pierden (ver Dudas de la spec 003).
  - Límites: calendario 50, categoría 40, título 100, descripción de evento 2000, lugar 200. La paleta de colores NO se impone en SQL, solo en `zod` (`lib/calendar/palette.ts`).
- Añadido por la spec 003:
  - `calendar_invites` (solo guarda `token_hash` = SHA-256 del token de 43 caracteres), `calendar_access_codes` (`public_code` de 8 caracteres de un alfabeto de 31 sin `I L O 0 1`; `pin_hash` con bcrypt de `pgcrypto`) y `join_attempts` (solo fallos). Los hashes se ocultan con **permiso por columna**: pedir `*` o `token_hash`/`pin_hash` da `42501`. Nadie escribe en estas tablas directamente.
  - `calendar_members`: `UPDATE` solo de la columna `role` y solo del propietario sobre filas no `owner`; `DELETE` por el propietario sobre otros o por cualquiera sobre su propia fila si no es `owner`. El `INSERT` directo sigue prohibido. Un trigger borra las preferencias de quien sale (los eventos y categorías que creó se quedan).
  - Funciones `SECURITY DEFINER` con `search_path = ''`: `create_invite`, `revoke_invite`, `get_invite_preview`, `accept_invite` (bloquea la fila: la carrera por el último uso da un éxito y un `CF404`), `set_access_code`, `disable_access_code`, `join_with_code` (devuelve `status` `ok | member | invalid | limited` en vez de lanzar, para que el fallo quede registrado) y `calendar_members_with_names(uuid[])` (única vía para ver nombres ajenos: nombre y rol, sin email ni zona horaria). `CF404` es el SQLSTATE propio de "invitación no válida".
  - `merge_calendars` no cambia: los miembros de los calendarios que desaparecen caen en cascada.
- Añadido por la spec 005: el azul antiguo de la spec 001 desaparece (migración `remove_old_blue`): el valor por defecto de `calendars.color` y el respaldo de `merge_calendars` e `import_calendar` pasan a `#A0C4FF`, y los calendarios y eventos con el azul antiguo se cambiaron a ese color. La guardia de diseño prohíbe el código del azul antiguo en `src/`.
- Añadido por la spec 006:
  - `calendars.owner_id` es anulable y hay `calendars.orphaned_at` (`check`: propietario nulo si y solo si hay fecha). `prevent_owner_change` solo deja cambiar el propietario con la marca de transacción `app.account_transfer`, que activan las funciones de cuenta.
  - Tablas (todas con RLS): `calendar_orphan_decisions` (lectura propia), `account_notices` (lectura propia y `UPDATE (read_at)` propio), `email_outbox` y `auth_email_requests` (sin acceso de clientes; la segunda solo guarda SHA-256 del email).
  - Funciones `SECURITY DEFINER`: `request_recovery` (anon), `delete_own_account` (borra `auth.users` del llamante tras dejar sin propietario los calendarios compartidos), `decide_orphan_calendar`, y solo para `postgres` y `service_role`: `copy_calendar_for_owner`, `apply_orphan_decisions`, `send_pending_emails` (con `p_dry_run` para tests) y `account_scheduled_jobs` (ayuda de tests). `CF404` vuelve a significar "no válido para ti".
  - `pg_cron`: `account-apply-orphans` (03:00 UTC), `account-send-emails` (cada 15 min) y `account-purge-recovery` (04:00 UTC). `pg_net` es asíncrono: un correo se marca enviado cuando una ejecución posterior lee un 2xx en `net._http_response`; hasta 5 intentos. Nunca envía a direcciones `.test`.
  - Vault: `brevo_api_key` y `brevo_sender_email` (los crea el usuario en el SQL Editor de cada proyecto).
- Añadido por la spec 005: `profiles.accent` (`text`, por defecto `'red'`, `check` en `red|blue|green|yellow|purple|gray`). La protegen las políticas de `profiles` (solo el propio); `visible_people()` y `calendar_members_with_names` no la exponen.
- Añadido por la spec 008: `profiles.last_view` (`text` anulable, `check` en `agenda|month|week|day`; nulo = nunca elegida). La escribe `saveLastView` al elegir una vista con botón o atajo, sin revalidar; la protegen las mismas políticas de `profiles`.
- Añadido por la spec 004: `import_calendar(p_name, p_color, p_events jsonb)` (`SECURITY INVOKER`, una transacción): crea el calendario del llamante y sus eventos desde un array de 1 a 2.000 elementos (`22023` si no) y, si un evento viola una restricción, no deja nada. No hay tablas ni columnas nuevas: el calendario importado no guarda nada de su origen.
- Añadido por la spec 007 (en dev y en prod):
  - Tablas con RLS: `calendar_connections` (cuenta de Google conectada: proveedor, `account_subject`, correo y estado `active | needs_reauth`; la lee solo su dueño), `calendar_connection_secrets` (solo el id del secreto de Vault; nadie la lee) y `synced_calendars` (calendario traído: id externo, estado `active | missing`, fallos y último resumen; la leen los miembros, sin el correo de la cuenta). Ningún cliente escribe en ellas. Borrar la conexión borra `synced_calendars` y deja el calendario como normal; un trigger borra el token de Vault.
  - `events.external_id`, único por calendario cuando no es nulo. `account_notices.kind` admite `sync_revoked` y `sync_failing`.
  - **Solo lectura:** las políticas de `events` exigen `not is_synced_calendar(calendar_id)` para crear, modificar, borrar o mover, también para el propietario. `merge_calendars` falla con `22023` si algún calendario es traído.
  - Funciones del usuario: `connect_account` (token a Vault; misma cuenta → reemplaza el token y la reactiva; sexta cuenta → `CF429`), `select_synced_calendars` (un calendario por elemento nuevo; más de 20 → `CF429`), `detach_synced_calendars` y `disconnect_account` (conservar o borrar). `CF404` = conexión ajena.
  - Funciones de sincronización `sync_claim_due`, `sync_claim_connection` (manual: `too_soon` antes de 5 minutos), `sync_get_token`, `sync_store_token`, `sync_apply_events` (reconcilia por `external_id` y guarda `{added, changed, removed, skipped, omitted}`) y `sync_fail` (`transient` → aviso al 3.er fallo; `revoked` → `needs_reauth` y aviso; `missing`). Reciben `p_secret`, que se compara con `cron_secret` de Vault (`42501` si no coincide), y se conceden a `anon`: así el motor no necesita la clave `service_role` (P4).
  - `pg_cron` `sync-run-due` (cada hora) llama a `sync_trigger()`, que solo si hay algo pendiente hace `net.http_post` a `sync_app_url || '/api/sync/run'` con `Authorization: Bearer <cron_secret>`. Vault: `cron_secret` (igual que `CRON_SECRET`) y `sync_app_url`, que crea el usuario en cada proyecto (dev: `http://localhost:3000`).
  - Ayudas de test solo para `service_role`: `vault_secret_matches` y `sync_scheduled_jobs`. `provider` admite `'microsoft'` en los `check`, pero desde la Enmienda 1 no se usa.
  - **Grupos** (migración `calendar_groups`): tabla `calendar_groups (user_id, name, position)` con RLS propia (solo su dueño la lee y escribe), nombre de 1 a 40 único por usuario ignorando mayúsculas y espacios exteriores, y `calendar_preferences.group_id` con FK compuesta `(group_id, user_id)`: no se puede asignar un grupo ajeno y borrar el grupo solo pone `group_id` a nulo. Un calendario, un grupo (clave primaria). La visibilidad del grupo no se guarda: se calcula de la de sus calendarios (`organizeGroups`, plan D14).
- Añadido por la spec 009 (migraciones `sync_write_schema`, `sync_write_functions` y `sync_apply_events_v2`; en dev y en prod):
  - `calendar_connections.can_write` (por defecto `false`) y `synced_calendars.google_access` (`owner | writer | reader`). `can_write_synced(uuid)` y el campo calculado `can_write(synced_calendars)`.
  - Las políticas de `events` siguen prohibiendo escribir en traídos: las escrituras pasan por funciones `SECURITY DEFINER` que exigen **sesión con rol owner/editor y además `p_secret`**: `sync_write_context` (comprueba rol, cuenta que escribe y acceso; `42501`, `22023` si se mezclan normal y traído o dos cuentas, `CF404`), `sync_commit_event` (insert/update/delete/gone tras el éxito en Google), `sync_update_calendar`, `sync_attach_created` y `sync_attach_uploaded` (`CF429` a los 20). El trigger `prevent_synced_rename` solo deja renombrar un traído con la marca `app.sync_write`.
  - `connect_account` recibe `p_can_write`; `select_synced_calendars` acepta `access`; `sync_set_access` guarda el acceso al listar.
  - `sync_apply_events` recibe `p_read_at` (no pisa filas con `updated_at >= p_read_at`, lo escrito en CaFam mientras se leía) y `p_access`, y solo borra eventos con `external_id`.
- **Cambios de esquema solo mediante una migración nueva** en `supabase/migrations/` (nunca editando el panel ni migraciones ya aplicadas). Después: `npm run db:push` (dev), `npm run db:types` y tests en `tests/integration/`.
- Añadido por la spec 012 (migraciones `event_images`, `event_images_functions`, `event_images_storage`, `event_images_purge_claim`, `copy_calendar_images`, `copy_calendar_images_fix`, `images_purge` y `reserve_images_order`; en dev y en prod):
  - `event_images (id, event_id → events on delete cascade, object_id, uploaded_by → profiles on delete set null, status pending|ready, bytes, width, height, created_at)` con RLS: los miembros del calendario leen las `ready` y quien reservó, sus `pending`; borran quien la subió, el propietario y los Editores. Nadie inserta ni actualiza directamente. Varias filas pueden compartir `object_id` (copias de calendarios sin propietario).
  - Bucket privado **`event-images`** (solo `image/jpeg`, 4 MB por objeto), rutas `<object_id>/full.jpg` y `<object_id>/thumb.jpg`. El permiso sale de `event_images → events → miembro` (`can_read_event_image`, `image_upload_allowed`), nunca de la ruta: mover o juntar no toca Storage.
  - Funciones: `reserve_event_images(p_event_id, p_images jsonb) returns uuid[]` (cualquier miembro; `CF429` con mensaje `event`/`user`/`total`, `CF404`, `22023`; el orden de `created_at` usa `clock_timestamp()`), `confirm_event_image(p_id)` (`P0002` si faltan los dos objetos) e `images_total_limit()`.
  - **Cola de purga** `image_purge_queue (object_id, bytes, attempts, queued_at, claimed_at)`, que llena el trigger `queue_image_purge` cuando desaparece la última fila de un objeto. Supabase no deja borrar objetos con SQL: `/api/images/purge` reclama con `images_claim_purge(p_secret, …)` (con `CRON_SECRET`, sin `service_role`), borra en Storage como `anon` (solo objetos reclamados en los últimos 5 min) y llama a `images_done_purge`. `pg_cron` `images-purge` (minuto 15 de cada hora) llama a `images_purge_trigger()`, que usa `sync_app_url` de Vault. Las reservas sin confirmar de más de 1 h también se purgan.
- Añadido por la spec 013 (migraciones `event_series`, `series_reserve_images`, `series_rules_fast_tz`, `event_series_functions`, `series_copy_upload` y `materialize_occurrence`; en dev y en prod):
  - `events` gana `recurrence` (RRULE sin `DTSTART`), `recurrence_tz` (nula en día completo), `recurrence_until` (fin de la última repetición, nulo si no acaba; acota las lecturas), `exdates timestamptz[]` (repeticiones borradas), `series_id` y `original_start` (de una excepción). FK `(series_id, calendar_id)` → `events (id, calendar_id)` en cascada: una excepción vive en el calendario de su serie y se mueve y borra con ella; `unique (series_id, original_start)`.
  - Trigger `enforce_series_rules`: sin series en calendarios traídos (`22023`), zona válida, `CF429 series` a las 500 por calendario, `CF429 exceptions` a las 100 excepciones más `exdates`, y no deja quitar la regla a una serie con excepciones. `reserve_event_images` da `22023` sobre una serie: las imágenes van siempre en la fila de una repetición.
  - Funciones `SECURITY INVOKER` (bloquean la serie con `for update`, así que un Lector recibe `CF404`): `update_occurrence`, `split_series`, `update_series` (con `"recurrence": null` en los campos convierte la serie en suelto), `delete_occurrences` y `series_loss` (excepciones e imágenes que se perderían). La regla truncada y los argumentos los calcula TypeScript (`planSeriesChange`, `planSeriesDelete`): SQL no expande reglas.
  - `materialize_occurrence(p_secret, p_series_id, p_original_start)`: `SECURITY DEFINER` para cualquier miembro, idempotente, con el secreto de Vault como las escrituras de la 009, porque la acción comprueba antes con `ical.js` que la fecha es una repetición.
  - `copy_calendar_for_owner` copia series y excepciones; `sync_attach_uploaded` v2 recibe en `p_mapping` `{event_id, external_id}` o `{series_id, starts_at, ends_at, external_id}`, suelta las excepciones y borra las series. `merge_calendars` no cambia.
- Añadido por la spec 014 (migraciones `event_comments` y `comments_copy_loss`; en dev y en prod):
  - `event_comments (id, event_id → events on delete cascade, author_id → profiles on delete set null default auth.uid(), client_id, body 1..1000, created_at, edited_at)`, `unique (author_id, client_id)` (un doble envío se guarda una vez). RLS: leen los miembros del calendario del evento; insertan los miembros como autores; actualiza el autor; borran el autor o `calendar_role_for = 'owner'`. Permisos por columna: `insert (event_id, body, client_id)` y `update (body)`.
  - Trigger `event_comments_rules`: recorta los extremos (`\s`), pone `edited_at` al cambiar el texto y da `22023` en la fila de una serie.
  - `copy_calendar_for_owner` copia los comentarios; `series_loss` devuelve también `comments` (se borró y se creó de nuevo por el cambio de tipo).
- La evolución prevista (`calendar_invites`, `calendar_access_codes`, …) está en el Anexo A de `specs/001-base-aplicacion/plan.md`.

### PWA

- Manifest: CaFam (nombre y nombre corto), `theme_color` y `background_color` piedra `#E8E5DD` (de `NEUTRALS.stone`), `start_url /dashboard/calendar`, `standalone`, iconos 192, 512 y 512 maskable generados desde `public/icons/icon.svg`. El favicon (`/icon.svg`) se enlaza explícitamente en `metadata.icons`: la convención de archivo sola no dejaba `<link rel="icon">`.
- iOS: `appleWebApp` en `layout.tsx` + `apple-touch-icon`. La portada muestra la ayuda "Compartir › Añadir a pantalla de inicio" **solo** en Safari iOS.
- `public/sw.js`:
  - Precachea `/offline`, los iconos y los `/_next/static/` que referencia `/offline`.
  - En navegaciones usa red primero, con `/offline` como respaldo.
  - Usa caché primero para `/_next/static/` e `/icons/`.
  - **Nunca cachea HTML con sesión ni respuestas de Supabase** (privacidad en dispositivos compartidos).
  - **Si cambias `sw.js` o los iconos, sube `CACHE_NAME`** (`cafam-vN`; ahora `v3`).
  - Se registra solo en producción.

### Identidad visual

Reglas completas en la constitución ("Identidad visual y diseño de interfaz", P9), inspiradas en `docs/referencia.jpg` (solo local, en `.gitignore`). Lo que hay en el código:

- **Tokens** en `src/app/globals.css`, con los valores de `src/lib/theme/accents.ts` (`accents.test.ts` los mantiene iguales):
  - Neutros (`@theme inline` sobre variables crudas): `stone #E8E5DD` (fondo), `paper #F2F0EA` (paneles), `ink #141414` (texto), `muted #66635D` (secundario, 4,5:1), `line #D6D1C4` (separadores), `control #857F75` (bordes de campos, 3:1) y `danger #B42318`, más `on-ink`, `pastel-ink`, `mark`/`on-mark` y `scrim`. El tema oscuro redefine las variables en `[data-theme="dark"]` y en `prefers-color-scheme: dark` sin `data-theme="light"` (valores en `DARK_NEUTRALS` y `THEME_INKS`).
  - Acento (`@theme inline`): `accent` (relleno), `on-accent` (texto encima), `accent-ink` (texto y líneas sobre piedra o papel) y `accent-edge` (borde de un relleno; en amarillo es oscuro porque el relleno no se distingue del fondo). Cada `[data-accent=…]` redefine las variables; `:root` es rojo para las páginas sin sesión.
- **El acento** lo pinta `AppFrame` con `data-accent` (y `data-app-frame`, que usa el selector de Ajustes para repintar sin recargar). Úsalo solo para hoy, la hora actual, los días de la semana, la selección y el próximo evento. Texto y líneas, siempre `accent-ink`; sobre un relleno `bg-accent`, siempre `text-on-accent` y `border-accent-edge`.
- **Colores de calendario** (paleta pastel de la spec 002): solo como marca (barra `border-l-4`, punto o barra de 4 px con contorno `ink/15`); el texto del evento siempre en tinta.
- **Tipografía**: Inter Tight (`next/font`, cifras tabulares comprobadas) para todo; `tabular-nums` en horas, fechas y contadores; sin monoespaciada.
- **Forma**: superficies separadas por tono (piedra/papel), paneles `rounded-3xl`, botones y controles `rounded-full`; `shadow-soft` en el cristal y `shadow-float`/`glass-float` solo en lo que flota (diálogos, hoja "Más", avisos, tooltips de la barra).
- **Componentes base**: `Button`/`LinkButton` primario en tinta (negro en claro, claro en oscuro, texto `on-ink`), secundario papel con borde `control`; campos `bg-paper` con borde `control`. Iconos: SVG propios en `components/shell/icons.tsx`.
- **Nunca** `text-white`, `text-black` ni la variante `dark:`: el tema cambia las variables, no las clases.

## 7. Entornos, despliegue y variables

| Entorno | Supabase | Uso |
|---------|----------|-----|
| dev | `calendario-dev` (ref `uthubyzhonrtrmbcqcjh`, eu-west-1) | `npm run dev` y `npm run test:db`. **El link local de la CLI debe apuntar siempre aquí** |
| prod | `calendario-prod` (ref `yznbdoskvtxeasujtirk`, eu-west-1) | Vercel. Site URL = URL de Vercel |

- Las funciones de Vercel corren en **Dublín (`dub1`)**, fijado en `vercel.json`, para estar junto a Supabase `eu-west-1`; en Washington cada consulta cruzaba el Atlántico y las páginas tardaban segundos. La mejora aún no está medida: si vuelve la lentitud, mira los logs de Vercel (duración y arranque en frío) antes de tocar código.
- Vercel despliega a producción cada push a **`main`** y hace previews de las demás ramas. Se trabaja en una rama por spec (`001-base-aplicacion`) y se integra en `main` con `git merge --ff-only`. `main` debe estar siempre desplegable.
- Para aplicar migraciones a prod (lo ejecuta el usuario):
  ```
  npx supabase link --project-ref yznbdoskvtxeasujtirk
  npx supabase db push
  npx supabase link --project-ref uthubyzhonrtrmbcqcjh   # volver a dev inmediatamente
  ```
- **Sincronización (spec 007)**, también a mano y por el usuario: URI de retorno de producción en Google, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` en Vercel, migraciones a prod y `cron_secret` y `sync_app_url` en Vault de prod. Los comandos exactos están en `specs/007-sincronizacion-oauth/plan.md`, "Pasos de producción".
- **Correo (spec 006)**, configurado a mano en cada proyecto de Supabase (dev y prod ya lo tienen):
  - Authentication → Emails → SMTP: Brevo, `smtp-relay.brevo.com`, puerto `587`; usuario el login SMTP de Brevo (`…@smtp-brevo.com`) y contraseña una **clave SMTP** (`xsmtpsib-…`), no la clave API. Remitente el email verificado en Brevo.
  - Plantillas *Reset password* y *Change email address*: el enlace es `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` (o `type=email_change`). Site URL correcta, notificación *Email address changed* activa y límite de correos por hora subido.
  - SQL Editor: `select vault.create_secret('<clave API>', 'brevo_api_key');` y `select vault.create_secret('<remitente>', 'brevo_sender_email');`. Sin ellas, el envío programado falla (los avisos siguen en la app).
  - Brevo: restricción de IP desactivada (Supabase llama desde IPs variables). Plan gratuito: 300 correos al día.
- El cron de Vercel llama cada día a `/api/cron/keep-alive`, que hace una consulta mínima para que Supabase Free no pause el proyecto tras 7 días de inactividad.

Variables (documentadas en `.env.example`):

| Variable | Dónde | Notas |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, `.env.test.local`, Vercel | Pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, `.env.test.local`, Vercel | Pública (`sb_publishable_…`) |
| `CRON_SECRET` | Vercel, `.env.local` y `.env.test.local` | Secreto del servidor. Desde la spec 007 debe ser igual que `cron_secret` en Vault (los tests de `sync-worker` lo usan) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `.env.local` y Vercel | Cliente OAuth de Google (spec 007), solo servidor. En dev, con la URI `http://localhost:3000/api/oauth/google/callback` |
| `SUPABASE_SECRET_KEY` | **Solo `.env.test.local`** | Crea y borra usuarios en `test:db`. Nunca en Vercel ni en `src/` |

**Permisos registrados en Google** (pantalla de consentimiento, proyecto `CaFam`), todos con el prefijo `https://www.googleapis.com/auth/`:

- Para usos futuros: `calendar.calendarlist`, `calendar.calendars`, `calendar.calendars.readonly`, `calendar.events` y `calendar.events.readonly`.
- Registrar un permiso no lo concede: el usuario solo autoriza los que la app pide en la URL de autorización.
- Desde la 009 la app pide `openid email calendar.calendarlist.readonly calendar.events calendar.calendars` (`GOOGLE_SCOPES` en `lib/sync/scopes.ts`). Sin todos ellos la cuenta queda de solo lectura (`can_write = false`).
- La 007 pedía `calendar.events.readonly` en lugar de los de escritura; las cuentas conectadas entonces hay que volver a conectarlas.

`.env.local` y `.env.test.local` apuntan a **dev** y están ignorados por git. No los leas ni los muestres en la salida.

## 8. Comandos

```
npm run dev            # http://localhost:3000 (el usuario suele tenerlo abierto: usa otro puerto, p. ej. npx next start -p 3100)
npm run build && npm start
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run format         # prettier --write .   |  npm run format:check
npm test               # vitest proyecto unit (jsdom)        → npm test -- <filtro>
npm run test:db        # vitest proyecto db contra Supabase dev → npm run test:db -- <filtro>
npm run db:push        # aplica migraciones al proyecto enlazado (dev)
npm run db:types       # regenera src/types/database.ts
```

## 9. Patrones del código (síguelos)

- **`cacheComponents: true`:** cualquier lectura de cookies o sesión va en un componente `async` dentro de `<Suspense>`, con `await connection()` antes de crear el cliente (Supabase usa `Date.now()`). Ejemplo: `Greeting` y `Calendars` en `src/app/dashboard/page.tsx`. Leer `cookies()` fuera de `<Suspense>` rompe el build.
- **Cliente de Supabase por contexto:**
  - `@/lib/supabase/server` en Server Components, Actions y Route Handlers.
  - `@/lib/supabase/client` en Client Components.
  - `@/lib/supabase/proxy` solo en `src/proxy.ts`.
  - El cliente de `server` siempre lleva el tipo `Database`.
- **Permisos:** confía en RLS y filtra por `user_id` cuando necesites tu fila (p. ej. tu rol en `calendar_members`). No uses la clave secreta en la app.
- **Server Actions:** devuelven un estado tipado (`src/lib/auth/form-state.ts`) con `fieldErrors`, `formError` y `values` para conservar lo escrito; el éxito hace `redirect()` fuera del `try`.
- **Identidad visual:** solo tokens (`bg-paper`, `text-muted`, `bg-accent`…); nada de `bg-white`, colores de la paleta de Tailwind ni hex en clases (la guardia `design-tokens.test.ts` falla). Un color que viene de datos (calendario, avatar) va en `style`.
- **Hora actual en el cliente:** `useNow()` (`lib/hooks/use-now.ts`), compartido y con `useSyncExternalStore`. En un Server Component no llames a `Date.now()` en el cuerpo (regla de lint de React): sácalo a una función de `lib/` (p. ej. `nextEventsWindow()`).
- **UI:** reutiliza `Button`, `LinkButton`, `TextField` y `FormAlert`. Accesibilidad:
  - Etiqueta visible en cada campo.
  - Errores enlazados con `aria-describedby` y anunciados (`role="alert"`, `aria-live`).
  - Botones con `min-h-11`.
  - Todo usable solo con teclado.
- **Páginas dinámicas (spec 002):** el `page.tsx` es síncrono; `params`/`searchParams` son promesas que se esperan dentro de un componente `async` bajo `<Suspense>`. Los `[id]` inválidos o ajenos hacen `notFound()`.
- **Server Actions que escriben:** validan con `zod` en español, leen con `requireActionUser()` (`lib/calendar/queries.ts`; los componentes usan `requireUser()`, que añade `connection()`), traducen errores con `getCalendarErrorMessage`, y antes de `redirect()` llaman a `revalidatePath("/dashboard", "layout")`. Sin eso, tras redirigir se ve el dato viejo por la caché de rutas del cliente. RLS oculta las filas sin dar error: un `update`/`delete` que devuelve 0 filas se explica con `canSeeCalendar`/`canSeeEvent` ("ya no existe" frente a "sin permiso").
- **Formularios con React 19:** tras cada acción React reinicia los campos. Usa campos **no controlados** (`defaultValue` desde `state.values`) y deja `useState` solo para lo que cambia la interfaz (p. ej. ocultar horas); un campo controlado no recupera lo enviado.
- **Ids de campos:** `useId()`, nunca `field-${name}` (ver trampas).
- **Para valores que solo existen en el navegador** (zona horaria, user agent…), usa `useSyncExternalStore` con un snapshot de servidor, no `useEffect` con `setState` (evita el aviso de hidratación y la regla de lint).
- **Comentarios:** en inglés, breves, explicando el porqué y citando el requisito o la decisión del plan (`// ... (RF-26, plan D13)`).
- **Tests:**
  - Los de componentes usan Testing Library por rol o etiqueta, con los textos en español.
  - Los de Route Handlers usan `// @vitest-environment node` y mockean `@supabase/supabase-js`.
  - Los de integración crean y borran usuarios con `tests/integration/helpers.ts`.
- **Ventana de evento (spec 008):** las rutas `/dashboard/events/new` y `/dashboard/events/[id]` tienen una copia interceptada en `src/app/dashboard/@modal/(.)events/…` que pinta lo mismo dentro de `EventModal`. Los datos salen de `load-new-event.ts` y `load-event.ts`, compartidos con las páginas completas; un cambio en lo que muestra el alta o el detalle va **ahí**, no en cada página. Para cerrar se usa `router.back()`. Un enlace a otra página cierra la ventana gracias a `@modal/[...catchAll]`.
- **Formularios dentro de la ventana:** `useEventModal()` devuelve la API de la ventana, o `null` en una página completa. Con ventana, `EventForm` envía el campo oculto `mode=modal`; `createEvent`, `updateEvent` y `deleteEvent(id, "modal")` devuelven entonces `{ done }` en vez de redirigir, y el formulario llama a `finish(done)`, que muestra el aviso, vuelve atrás y hace `router.refresh()`. Cualquier escritura nueva desde la ventana sigue ese patrón.
- **Resultados de acciones que cierran algo:** atiéndelos **una sola vez por objeto de estado** (`handled` con `useRef`), porque Activity vuelve a ejecutar los efectos al mostrar la ruta otra vez (ver trampas).
- **Foco al abrir un `<dialog>`:** `showModal()` enfoca el primer control. Para empezar en otro campo, márcalo con `data-autofocus`; `EventModal` y `QuickCreate` lo enfocan tras abrir.
- **Crear desde la rejilla:** el workspace guarda el borrador (`Draft`), las vistas reciben `onCreate`/`draft` solo si `canCreate`, y `QuickCreate` es estado del cliente, no una ruta. La lógica de posiciones vive en `lib/calendar/slots.ts` y `popover.ts` (pura y testeada).
- **Avisos:** `useToast().show(texto)` dentro del marco de la app (`ToastProvider` en `AppFrame`).
- **Atajos:** se añaden en `KEYS` de `lib/calendar/shortcuts.ts` (con su test) y se atienden en `use-calendar-shortcuts.ts`.
- **Sincronización (spec 007):** el servidor nunca usa `service_role`. `engineDeps()` crea un cliente con la clave publicable y pasa `CRON_SECRET` como `p_secret` a las funciones `sync_*`. Antes de llamar al motor desde una acción o página, comprueba con la sesión (RLS) que la conexión es del usuario (`getConnection`). Las llamadas a Google van solo en `providers/google.ts` y sus fallos son `ProviderError` con `kind` `revoked | missing | transient`.
- **Escritura en Google (spec 009):** las acciones llaman a `writeEvent` (`lib/sync/write-event.ts`), `renameSyncedCalendar`/`createSyncedCalendar` (`write-calendar.ts`) o `uploadCalendar` (`upload-calendar.ts`) con `writeEngineDeps(supabase)`, que usa la sesión del usuario más `CRON_SECRET`. Plazo de 9 s por escritura de evento. Los mensajes salen de `WRITE_ERRORS` (`write-errors.ts`), que no importa el cliente de Google para poder usarse en el navegador. `no-secrets.test.ts` falla si un componente `"use client"` importa el motor (salvo `import type`).
- **Calendarios traídos:** `CalendarRecord.synced` (de `getMyCalendars`/`getCalendar`) es `null` en los normales. Para decidir qué ofrece la interfaz usa `canWriteEvents`, `moveTargets`, `readOnlyReason` y `canMerge` de `lib/sync/read-only.ts`, nunca `role !== "viewer"` a secas. La base de datos lo impone igualmente.
- **Móvil y escritorio (spec 016):** las variantes `max-tab:` (hasta 768 px) y `tab:` (desde 769 px) de `globals.css` separan el marco del móvil del de escritorio; no uses `md:` para eso. En JavaScript, `useIsPhone()` con la misma consulta.
- **Cabecera del móvil:** la pantalla del calendario publica su título, el selector y el "Hoy" con `usePublishCalendarHeader` (`components/shell/calendar-header.tsx`); `TopBar` los pinta. Lo que va dentro del cajón se lleva con `createPortal` a `drawerSlot`.
- **"Hoy" en la agenda:** no navega; se pide con `requestAgendaToday()` (`lib/calendar/agenda-today.ts`), un evento de `window` que atiende `AgendaView`. La cabecera, la barra de herramientas y la tecla T lo usan.
- **Ids de evento (spec 013):** un id de la URL puede ser de una repetición (`<uuid>_<fecha>`). Valídalo con `parseEventId`, nunca con `z.uuid()`, y lee con `getEvent`, que devuelve la fila, la excepción o la repetición calculada con su `series`.
- **Comentarios (spec 014):** las acciones de `app/dashboard/events/comment-actions.ts` no redirigen: devuelven `CommentResult` con la lista ya actualizada (reciben `since`, el comentario más antiguo cargado). `gone` cierra la ventana o vuelve al calendario. Un id de repetición se resuelve con `commentRowFor`.
- **Escrituras sobre series:** `updateEvent` y `deleteEvent` leen `scope` y `confirmLoss` del formulario; las funciones y sus argumentos salen de `planSeriesChange`/`planSeriesDelete` (puras y testeadas), y la acción solo consulta `series_loss` y llama. Un cambio nuevo sobre series va ahí.
- **Commits:** Conventional Commits en español con la tarea: `feat: registro de usuario (T7)`.

## 10. Trampas conocidas

- **Next.js 16 ≠ lo que conoces:** `middleware.ts` se llama `proxy.ts`; hay `cacheComponents`, `partialPrefetching` y `LayoutProps`/`PageProps` globales. Consulta `node_modules/next/dist/docs/` antes de usar una API.
- **Finales de línea:** la máquina tiene `core.autocrlf=true`. `.gitattributes` fuerza LF, y si `format:check` falla en masa por CRLF, `npx prettier --write .` lo arregla sin cambiar contenido. `docs/`, `specs/` y `AGENTS.md` están en `.prettierignore` (se redactan a mano).
- **`test:db` es intermitente:** a veces una llamada a Supabase dev se cuelga y un test da timeout (30 s). Es un problema conocido y no siempre cae en el mismo test: repite la ejecución antes de investigar el código. Mejora pendiente: añadir timeout o reintento en los helpers.
- **Con `cacheComponents`, Next conserva la página anterior oculta en el DOM** (Activity). Hay dos formularios a la vez tras navegar, así que los `id` fijos se duplican y `getByLabel` de Playwright da "strict mode violation": filtra con `.locator('visible=true')`. En producción no se nota para el usuario.
- **El reloj local va por delante del de la base de datos** (segundos): en los tests de integración, para "caducar" algo retrasa una hora, no un segundo.
- **En plpgsql `PERFORM` reinicia `FOUND`:** guarda `found` en una variable justo después del `SELECT INTO` (el fallo que corrigió `fix_join_with_code`).
- **Una migración aplicada no se edita:** la corrección va en otra (por eso hay `..._fix_join_with_code.sql`).
- **`useActionState` pasa `(prevState, formData)` a la acción**, también a las que se enlazan con `bind`; las de confirmar (`revokeInvite(id)`, `expelMember(calendarId, userId)`…) ignoran esos argumentos. En los tests mira `mock.calls[0][0]`, no `toHaveBeenCalledWith(id)`.
- **El PIN nunca vuelve al formulario:** las acciones que lo reciben devuelven `values.pin = ""`.
- **Al escribir ficheros con heredocs en Bash**, un apóstrofo o una comilla rara puede romper el comando entero; usa la herramienta Write o un script en un fichero.
- **`ical.js` deja los eventos con `TZID` como hora "de pared" sin zona** (aunque el archivo traiga `VTIMEZONE`): `parse-ics.ts` lee el `TZID` del parámetro y `convert-events.ts` lo convierte con `zonedLocalToUtc`, una vez por ocurrencia. Un `TZID` que `Intl` no reconoce se omite.
- **La descarga del enlace usa `node:https` con un `lookup` propio** que valida la IP al conectar (anti-SSRF, anti DNS rebinding). No la cambies por `fetch`.
- **PostgREST devuelve como mucho 1.000 filas por consulta**: en tests con más, cuenta con `{ count: "exact", head: true }`.
- **`user.upload` de user-event no llega al `FormData` de jsdom** (sustituye `input.files`): un test de un formulario con archivo no puede comprobar el archivo recibido; se comprueba en el navegador.
- **El cuerpo de las Server Actions está limitado** (`serverActions.bodySizeLimit` en `next.config.ts`, 3 MB por la importación); más que eso lo rechaza Next antes de la acción.
- **Un script de verificación no debe seguir tras un fallo:** comprueba la salida de `typecheck` antes de hacer commit.
- **Probar en un navegador real:** `playwright-cli` está instalado globalmente. Arranca la app compilada con `npx next start -p 3100`, crea el usuario de prueba por `/signup` y bórralo de `dev` al terminar. Un `check()` sobre un radio `sr-only` falla: haz clic en el círculo (`label span[aria-hidden]`).
- **jsdom no implementa `<dialog>.showModal()`:** los tests de diálogos lo simulan en un `beforeAll`.
- **Tras usar el link de prod**, vuelve a enlazar dev; si no, `db:types` o `db:push` irían contra producción.
- **`src/types/database.ts`** se regenera tras cada migración y no se formatea con Prettier.
- **Usuarios de prueba:** los tests los crean y borran solos. Si creas usuarios a mano en dev para probar, bórralos al terminar.
- La primera petición tras un despliegue en Vercel puede tardar varios segundos (arranque en frío). No lo confundas con un fallo.
- **`LayoutProps<"/ruta">` de una ruta nueva** no existe hasta que Next genera los tipos (build o `next typegen`): `typecheck` falla antes del build. En layouts nuevos tipa `children` a mano.
- **`hidden` en el `className` de `LinkButton` no oculta**: su `inline-flex` gana. Para ocultarlo por tamaño envuélvelo en un `div` (`hidden lg:block`).
- **Tests de formularios con error**: `findByLabelText` encuentra el campo antes de que llegue la respuesta de la acción; espera al mensaje (`findByText`) antes de comprobar `aria-describedby`, o el test falla de forma intermitente con la máquina cargada.
- **Cookie de un usuario borrado**: `getClaims()` valida el JWT sin consultar la base de datos, así que en `playwright-cli` sigues "con sesión" tras borrar el usuario de prueba. Limpia las cookies (`page.context().clearCookies()`) antes de registrar otro.
- **Icono de la app instalada**: iOS no lo cambia hasta volver a añadir la app a la pantalla de inicio; Android lo actualiza cuando revisa el manifest. Lo que sí se renueva al publicar es lo que guarda el service worker (`CACHE_NAME`).
- **La carpeta `.playwright-cli/`** (capturas de la herramienta) no está ignorada: bórrala al terminar o `format:check` falla.
- **Rutas interceptadas + Activity (spec 008):** al cerrar la ventana, Next guarda la ruta interceptada **oculta** en el DOM y, si se vuelve a abrir la misma URL, muestra **esa misma instancia**, con su estado y repitiendo sus efectos. Esto causó tres fallos: un `<dialog>` modal oculto pero abierto dejaba la página inerte; el éxito del guardado anterior volvía a cerrar la ventana nada más abrirla; y el detalle reaparecía en modo edición. Por eso `EventModal` cierra el diálogo y remonta su contenido (`key`) en la limpieza del efecto, y los formularios atienden cada resultado una sola vez. Cualquier ventana nueva basada en rutas necesita lo mismo.
- **Borrar desde la ventana:** `revalidatePath` vuelve a pintar la ruta interceptada del evento recién borrado. Un `notFound()` ahí convierte **toda la página** en 404, así que la ruta interceptada devuelve `<GoneEvent />` (cierra y avisa) y solo la página completa hace `notFound()`.
- **`setState` en el cuerpo de un efecto lo prohíbe el lint** (`react-hooks/set-state-in-effect`). Si hay que reiniciar estado cuando Activity oculta una ruta, hazlo en la **limpieza** del efecto, que el lint permite.
- **jsdom:** no lanza `cancel` en un `<dialog>` al pulsar Escape (dispárale `new Event("cancel", { cancelable: true })`), no tiene `scrollIntoView` (sobrescríbelo en `HTMLElement.prototype`), ni layout (simula `getBoundingClientRect`). La región de avisos (`role="status"`) siempre existe: en los tests espera al **texto** (`findByText`), no a la región.
- **`scrollIntoView` desplaza todos los contenedores**, incluida la ventana que envuelve el formulario: para mover solo una lista ajusta su `scrollTop`.
- **`not-sr-only` vuelve a permitir el salto de línea** (`white-space: normal`): si el texto debe quedar en una línea, añade `truncate` en la misma variante (`sm:truncate`).
- **Límite de Supabase Auth en `test:db`:** muchas ejecuciones seguidas, o tras pruebas en el navegador, dan `AuthApiError: Request rate limit reached` en los `beforeAll`. No es un fallo del código: espera unos minutos y lanza `npm run test:db -- --no-file-parallelism`.
- **Editar ficheros con Python en Windows:** abre con `encoding='utf-8', newline=''`. Sin `newline=''` escribe CRLF y `format:check` falla; sin `encoding` usa cp1252 y estropea las tildes (pasó en el `plan.md` de la 007).
- **Tablas temporales en funciones `SECURITY DEFINER` con `search_path = ''`:** cualifícalas como `pg_temp.nombre` y créalas `on commit drop`.
- **OAuth de Google en dev solo en el puerto 3000**: es la única URI de retorno registrada. Con `next start -p 3100` las pantallas funcionan, pero conectar una cuenta real no; para probarlas sin Google, siembra la conexión y el calendario con SQL en dev.
- **Previews de Vercel**: apuntan a la base de datos de producción con las variables de Preview, que no tienen `GOOGLE_CLIENT_ID` ni `GOOGLE_CLIENT_SECRET`; conectar Google en una preview falla. No es un fallo del código.
- **Microsoft Entra no admite cuentas personales sin directorio** (`AADSTS16000`), y crearlo exige una suscripción de Azure con tarjeta. Por eso la 007 quitó Microsoft (Enmienda 1).
- **Un evento borrado en CaFam durante una actualización** puede reaparecer hasta la siguiente (plan 009 R9): `p_read_at` protege lo cambiado, no lo borrado. No es un fallo.
- **Las cuentas conectadas en la 007 no escriben** (`can_write = false`) hasta volver a conectarlas con los permisos nuevos.
- **El CDN de Supabase Storage guarda la descarga por URL y token** (spec 012): con `storage.download()` un miembro expulsado seguía viendo la imagen. `downloadImage` pide `/storage/v1/object/authenticated/…?v=<uuid aleatorio>` con `cache: "no-store"`, así cada petición pasa por RLS (plan D5). No lo cambies por enlaces firmados ni por `download()`.
- **`now()` es el mismo en toda la transacción**: para ordenar filas insertadas en una sola llamada usa `clock_timestamp()` (lo corrigió `reserve_images_order`).
- **Los objetos del bucket no se borran con SQL**: se encolan en `image_purge_queue` y los borra `/api/images/purge`. En dev, sin la app en el puerto de `sync_app_url`, la cola crece; los tests limpian sus filas con `deleteQueuedImages`.
- **Si Google mueve un evento entre calendarios**, la sincronización lo ve como un borrado y un alta: sus imágenes se pierden (plan 012 R5, coherente con RF-18). No es un fallo.
- **Alta con imágenes desde la página completa**: tras subir, el formulario navega con `window.location.assign`, porque `router.replace` al detalle lo intercepta `@modal` y deja el formulario detrás.
- **Activity y los `input type="file"`**: tras navegar, el formulario de alta sigue oculto en el DOM con su propio `input` de archivos; en `playwright-cli` apunta al del detalle (`section[aria-label="Añadir imágenes"] input`).
- **Remitente de los correos**: Brevo no envía "en nombre de" una dirección gratuita (`@gmail.com`…) y la reescribe a `…@<id>.brevosend.com` (en prod, `alexponmon@12551706.brevosend.com`). Si "no llega" un correo que Brevo da por entregado, búscalo por `from:brevosend.com` en todo el buzón, spam incluido. Un dominio propio lo evitaría, pero cuesta dinero.
- **Tailwind 4 solo busca clases en `src/`** (`@import "tailwindcss" source("..")` en `globals.css`). Sin eso escanea todo el repositorio y convierte en CSS los ejemplos de la documentación (así se coló el azul antiguo `bg-[#…]` en producción).

- **Agenda continua (spec 016):** los centinelas `agenda-start` y `agenda-end` se observan con un `IntersectionObserver` nuevo en cada cambio de ventana; un tramo que llega tarde y ya no es contiguo se descarta. En los tests, antes de simular otra intersección espera a los efectos (`await act(async () => {})`) o el observador viejo pide un tramo que se tira.
- **`ScrollOnMount`** recibe `top: () => number` y `scrollKey`: solo vuelve a desplazar si cambia la clave, no en cada render.
- **`hyphens-auto`** en los bloques de la semana parte con guion en Safari (español); Chromium en Windows parte la palabra sin guion, como Google. No es un fallo.

- **Lectores e imágenes en repeticiones (spec 013):** `update_occurrence` les da `CF404` (bloquea la serie), así que materializar para una imagen usa `materialize_occurrence` con el secreto. Sin él, un Lector podría crear copias de la serie en cualquier fecha.
- **`deleteEvent` recibe el formulario en distinta posición** según se enlace con o sin `"modal"` (`useActionState` añade estado y formulario): búscalo con `instanceof FormData`.
- **Los tipos generados no admiten `null`** en los argumentos de las funciones: en tests, `null as unknown as string`; en las acciones, los argumentos de `planSeries*` van con `as never`.
- **`pg_timezone_names` es lento** dentro de un trigger que corre en cada fila: `series_rules_fast_tz` valida la zona con `now() at time zone`.
- **es-ES no agrupa números de cuatro cifras** (`(1000).toLocaleString("es-ES")` da "1000"): para "1.000" usa `formatCount` (`lib/comments/limits.ts`, `useGrouping: "always"`).
- **Los cursores de los comentarios usan `created_at` tal como lo devuelve Postgres** (con microsegundos): no lo pases por `Date`, o el sondeo pierde o repite comentarios.
- **Parar `next start` en segundo plano:** detener la tarea no mata el proceso de Node y el puerto 3100 queda ocupado; mata el PID que escucha en él (`netstat -ano | grep :3100`).

## 11. Fuera de alcance hasta su spec

Vistas de año y de 4 días, búsqueda, papelera o deshacer más de una acción, recordatorios push, compartir e integrar con el sistema, alta en lenguaje natural (las cuatro últimas, en la hoja de ruta de la constitución), zona horaria por evento, sincronizar o actualizar un calendario importado, importar a un calendario que ya existe, exportar a `.ics`, verificación de email en el registro, traspaso voluntario de calendarios, exportar los datos de la cuenta, login social, Microsoft, notificaciones, uso offline con datos e i18n. No implementes nada de esto sin su spec aprobada. Mover o redimensionar arrastrando y "Deshacer" en los avisos ya tienen spec aprobada (017), igual que el asistente (015): se implementan siguiendo su plan y sus tareas cuando estén aprobados.

## 12. Cómo continuar

La 006 y la 008 están cerradas y en producción (2026-10-23 y 2026-10-24). La 008 añadió la migración `profile_last_view`, ya aplicada en prod.

La **007 (sincronización de Google, solo lectura, y grupos)** y la **009 (sincronización bidireccional)** están cerradas y en producción (2026-10-28 y 2026-10-29). La aplicación de Google está **publicada sin verificar** (proyecto `CaFam`, con marca, página principal y `/privacy`; sin logotipo para no tener que verificarla). En producción usa el cliente web `CaFamWeb`; en dev, `CaFam Local`.

- La **010 (renombrar a CaFam)** está cerrada y en producción (2026-10-29). Queda abierto `invites.test.ts` ("returns a 43 character token"), que falla cuando el reloj local va por detrás del de la base de datos (trampa del reloj); no es de ninguna spec.
- La **011 (rediseño visual)** está cerrada y en producción (2026-10-30), con `profile_theme` aplicada en prod.
- La **012 (imágenes)** está cerrada y en producción (2026-10-30), con sus 8 migraciones aplicadas en prod.
- La **016 (calendario al estilo Google)** está cerrada (2026-10-30). Las previews de Vercel están protegidas con su inicio de sesión: para verlas en el móvil hay que entrar en Vercel o usar "Share".
- La **013 (eventos recurrentes)** está cerrada (2026-10-31), con sus 6 migraciones aplicadas en prod.
- La **014 (comentarios)** está cerrada (2026-11-01), con sus 2 migraciones aplicadas en prod.
- **Siguiente:** por orden y cada una con su plan y sus tareas aprobados: 017 (mover arrastrando, menú y "Deshacer"; spec aprobada, enmienda 5 ya en la constitución; tendrá que decidir el alcance al soltar una repetición) y 015 (asistente de chat). Las specs de la 011 a la 015 están aprobadas desde el 2026-10-29.
- Los usuarios de prueba usan `@cafam.test`. Los antiguos del dominio anterior se borraron de dev en la spec 010 (T5), con permiso del usuario.
