# Constitution - CaFam

## Contexto y objetivo

CaFam es una aplicación web progresiva (PWA) de calendario compartido, mobile-first e instalable en iOS, Android y escritorio, para uso estrictamente personal entre familia y amigos. Cada usuario se registra, gestiona sus calendarios desde un panel, crea eventos (también repetidos, con imágenes y comentarios) y los comparte con otras personas asignándoles un rol (Lector o Editor). También puede importar o sincronizar calendarios externos y preguntar a un asistente de chat por sus eventos y por la disponibilidad común.

**Nombre:** el proyecto se llama **CaFam** en todas partes (marca, PWA, documentación, specs, configuración, comentarios e identificadores; `cafam` en minúsculas donde haga falta). Los nombres anteriores del proyecto (listados en la spec 010) no se usan, salvo en la URL de producción de Vercel, que se conserva, y en las migraciones ya aplicadas, que no se editan (enmienda 3, 2026-10-29).

Queda fuera a propósito: cualquier uso comercial, monetización, publicidad, analítica de terceros, multi-organización o funcionalidades de equipo/empresa, y cualquier servicio que tenga coste económico.

### Hoja de ruta de specs (orientativa, cada una exige su propia spec aprobada)

| Spec | Alcance |
|------|---------|
| 001-base-aplicacion | Proyecto base, autenticación email/contraseña, esquema de datos base con permisos, panel esqueleto, PWA instalable, despliegue |
| 002-calendarios-y-eventos | CRUD de calendarios y eventos, vistas mensual, semanal y diaria |
| 003-comparticion | Enlace de invitación único, ID de calendario + PIN, gestión de roles Lector/Editor |
| 004-importacion-ics | Fase 1 de integración: importación única de un .ics (enlace o archivo) de Google, iCloud u Outlook a un calendario propio editable |
| 005-identidad-visual | Rediseño de todas las pantallas existentes con la identidad visual propia (sección "Identidad visual y diseño de interfaz") y elección del color de acento por el usuario |
| 006-gestion-de-cuenta | Recuperación de contraseña, cambio de email, borrado de cuenta (requiere SMTP gratuito) |
| 007-sincronizacion-oauth | Fase 2: sincronización de solo lectura (proveedor → CaFam) con Google vía OAuth 2.0, actualización automática y manual, y grupos de calendarios. Microsoft se quitó el 2026-10-27 (registrar la aplicación exige tarjeta, P2). Cerrada el 2026-10-28 con la aplicación de Google en "Prueba" (Enmienda 2). La sincronización bidireccional pasa a la 009; Microsoft queda para una versión futura con su propia spec |
| 008-mejoras-de-experiencia | Calendario al estilo de Google Calendar (analizado con REA): alta y detalle en una ventana sobre el calendario, ventana rápida junto al hueco, arrastrar para crear, selector de hora, atajos de teclado, vista recordada |
| 009-sincronizacion-bidireccional | Fase 3: sincronización en los dos sentidos con Google (crear, cambiar, mover y borrar eventos de los calendarios traídos, renombrar, crear y subir calendarios), política de privacidad pública y publicación de la aplicación de Google sin verificar |
| 010-renombrar-cafam | Renombrar todo el proyecto a CaFam (código, configuración, documentación, specs cerradas y repositorio) |
| 011-rediseno-visual | Modo oscuro con selector, transparencias (glassmorphism), animaciones, microinteracciones y transiciones entre vistas y calendarios |
| 012-imagenes-en-eventos | Adjuntar imágenes a los eventos (también en calendarios traídos de Google) con Supabase Storage |
| 013-eventos-recurrentes | Eventos repetidos con reglas personalizables y edición de una repetición, de las siguientes o de toda la serie |
| 014-comentarios-en-eventos | Notas y comentarios en los eventos por cualquier miembro del calendario, Lectores incluidos |
| 015-asistente-de-chat | Asistente de chat en lenguaje natural que consulta los eventos y la disponibilidad común entre usuarios, con un proveedor LLM gratuito |
| 016-calendario-estilo-google | Calendario como Google Calendar en el móvil: eventos como bloques rellenos, cabecera con cajón y botón flotante, deslizar para cambiar de periodo, agenda continua y fila de meses. Se hace antes de la 013 |
| 017-mover-eventos-y-menu | Mover y redimensionar eventos arrastrando (dedo y ratón), menú contextual en el ordenador (color, duplicar, borrar), "Deshacer" en los avisos, detalle en hoja inferior en el móvil, pellizcar para ampliar las horas y más atajos. Va después de la 016 y antes de la 013 |
| 018-sincronizacion-icloud | Sincronización en los dos sentidos con los calendarios de iCloud (iPhone) por CalDAV, con contraseña específica de app y el mismo alcance que Google en la 007 y la 009. Enmienda 6 (iCloud como servicio aceptado y `tsdav` como dependencia) |
| Futura (sin número) | Recordatorios con notificaciones push (Web Push, gratis; en iOS solo con la app instalada) |
| Futura (sin número) | Búsqueda de eventos por título, lugar y descripción |
| Futura (sin número) | Compartir e integrar con el sistema: compartir un evento, recibir `.ics` o fotos compartidas, accesos directos y número de eventos de hoy en el icono |
| Futura (sin número) | Alta de eventos en lenguaje natural ("Cena con Ana mañana a las 21"), sin IA ni coste |

Las specs se numeran por orden de redacción. Las specs 001 a 004, ya cerradas, citan la gestión de cuenta como "spec 005" y OAuth como "spec 006": desde el 2026-10-22 son la 006 y la 007. Las specs cerradas no se editan, con una única excepción: el cambio de nombre a CaFam de la spec 010, que solo sustituye el nombre y no toca requisitos, decisiones ni evidencias (enmienda 3).

## Principios innegociables

- P1: Uso personal sin ánimo de lucro: el proyecto no incluye publicidad, venta de datos, tracking ni analítica de terceros. El único tercero que puede recibir datos de calendario para procesarlos es el proveedor LLM del asistente de chat: solo recibe lo necesario para responder a la pregunta del usuario que lo usa, está declarado en `/privacy` y nunca recibe datos de Google Calendar si sus condiciones le permiten entrenar con ellos (política de datos de usuario de las APIs de Google). Se verifica revisando `package.json` y los imports en cada diff (ningún SDK de ads, analytics o tracking) y, en la spec 015, las condiciones del proveedor elegido.
- P2: Coste cero: todo servicio usado funciona en su capa gratuita (Supabase Free, incluido Storage, Vercel Hobby, GitHub Free, Brevo y el proveedor LLM del asistente) y ningún servicio tiene tarjeta de pago asociada al proyecto. Se verifica revisando en la spec que cada servicio nuevo indica su plan gratuito, sus límites y cómo se respetan (cuotas de imágenes, límite de preguntas al asistente).
- P3: Privado por defecto: ningún dato de un calendario (eventos, imágenes, comentarios, disponibilidad) es visible para quien no sea su propietario o un miembro invitado con rol explícito, toda tabla del esquema `public` tiene Row Level Security activado y todo bucket de Storage es privado con políticas en `storage.objects`. El asistente de chat consulta con la sesión del usuario, así que nunca ve más que él; la disponibilidad de otra persona solo se usa si esa persona lo ha consentido. Se verifica con `npm run test:db` en verde (matriz de permisos, también de Storage) y con el test que comprueba que ninguna tabla de `public` tiene RLS desactivado.
- P4: Los secretos solo viven en el servidor: ninguna clave secreta (`service_role`/secret key de Supabase, `CRON_SECRET`, tokens OAuth, contraseñas específicas de app de iCloud, clave del proveedor LLM) lleva prefijo `NEXT_PUBLIC_`, se importa desde código de cliente ni se sube a git. Se verifica con `git check-ignore .env.local` y buscando `NEXT_PUBLIC_.*SECRET` y `service_role` en el diff (cero resultados en `src/`).
- P5: PWA mobile-first: toda pantalla se usa sin scroll horizontal entre 360 px y 1920 px de ancho y la app es instalable (manifest + service worker válidos). Se verifica en Chrome DevTools > Application (manifest sin errores, service worker activo) y con prueba manual en móvil y escritorio.
- P6: Stack cerrado: solo se usan lenguajes, dependencias, servicios y herramientas listados en "Stack permitido"; cualquier otro exige aprobación explícita registrada en la spec que lo introduce. Se verifica comparando `package.json` y los imports con esta constitución y la spec activa.
- P7: Flujo SDD obligatorio: no se escribe código sin spec, plan y tareas aprobados explícitamente por el usuario, en ese orden, y cada tarea se implementa de una en una con su test primero. Se verifica comprobando que cada cambio de código cita una tarea `Tn` de un `tasks.md` aprobado.
- P8: Ninguna tarea se da por hecha sin ejecutar y reportar la verificación obligatoria. Se verifica con el checklist de "Verificación obligatoria" completo y su salida reportada al cerrar cada tarea.
- P9: Identidad visual propia y accesible: toda pantalla sigue las reglas de "Identidad visual y diseño de interfaz", usa solo los tokens de diseño definidos en `src/app/globals.css` (nunca colores, tamaños o radios sueltos) y cumple WCAG 2.2 AA en el tema claro y en el oscuro (texto 4,5:1, elementos gráficos 3:1, objetivos táctiles de 44 px, foco visible, todo usable con teclado, también sobre superficies transparentes). Se verifica en cada tarea que toca interfaz con capturas a 390, 768 y 1440 px en los dos temas revisadas contra la lista de prohibiciones de esa sección y con la comprobación de contraste de cada color de acento en los dos temas.

## Stack permitido

- Lenguaje y versión: TypeScript 5.x en modo `strict`, sobre Node.js 24 LTS (mínimo Node 20.9, requisito de Next.js 16).
- Frontend: Next.js 16 (App Router, Turbopack, Server Components y Server Actions), React 19, Tailwind CSS 4.
- Backend / BaaS: Supabase Free (PostgreSQL con RLS, Supabase Auth email/contraseña, Supabase Storage para las imágenes de los eventos, `pg_cron`, `pg_net` y Vault). Región de datos en la UE.
- Hosting: Vercel Hobby (incluye su Cron Job diario) con repositorio en GitHub (privado).
- PWA: nativa de Next.js (`app/manifest.ts`) + service worker propio en `public/sw.js`, sin librerías PWA.
- Servicios externos aceptados: Google Calendar API (OAuth, spec 007 y 009), iCloud por CalDAV (con contraseña específica de app, spec 018; enmienda 6), Brevo (correo, spec 006) y un proveedor LLM con capa gratuita sin tarjeta para el asistente de chat, que elige y aprueba la spec 015 (Gemini queda descartado porque su capa gratuita no puede usarse con usuarios de la UE). El proveedor LLM se llama con `fetch` desde el servidor, sin SDK.
- Dependencias de producción aceptadas: `next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `ical.js` (aprobada en la spec 004 para leer `.ics`; desde la enmienda 3 también se usa para expandir reglas de repetición, en módulos de `src/lib/` del servidor o puros), `tsdav` (cliente CalDAV, MIT, aprobado en la spec 018 para iCloud; solo en el servidor; enmienda 6) y las que genera `create-next-app` por defecto.
- Animación: solo CSS (transiciones, `@keyframes`) y APIs nativas del navegador (View Transitions API); ninguna librería de animación.
- Dependencias de desarrollo aceptadas: `typescript`, `@types/*`, `tailwindcss`, `@tailwindcss/postcss`, `eslint`, `eslint-config-next`, `eslint-config-prettier`, `prettier`, `vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`, `supabase` (CLI para migraciones y generación de tipos).
- Herramientas obligatorias: npm como gestor de paquetes (con `package-lock.json` versionado), git, Vitest para tests, ESLint + Prettier para lint y formato, Supabase CLI para migraciones.

## Stack prohibido

- Cualquier servicio, hosting o API de pago, o capa gratuita que exija tarjeta de crédito.
- SDKs de publicidad, analítica, tracking o telemetría de terceros (Google Analytics, Meta Pixel, Hotjar, Sentry, etc.).
- Librerías PWA de terceros (`next-pwa`, `@serwist/*`, Workbox) sin aprobación en spec: el service worker es propio.
- ORMs u otras capas de acceso a datos sobre Supabase (Prisma, Drizzle) y backends paralelos: Supabase es la única fuente de datos.
- Otro gestor de paquetes (yarn, pnpm, bun) o lockfiles distintos de `package-lock.json`.
- Cualquier dependencia no listada en "Stack permitido" sin aprobación en la spec que la introduce (por ejemplo, la librería de vistas de calendario o de parseo .ics se decide y aprueba en su spec).

## Convenciones

- Formato: Prettier automático; `npm run format` para formatear y `npm run format:check` para verificar.
- Tipado: `strict: true`, prohibido `any` explícito (regla de ESLint en error); `npm run typecheck` (`tsc --noEmit`) sin errores.
- Nombres de código: inglés; camelCase para variables y funciones, PascalCase para componentes React y tipos, UPPER_SNAKE_CASE para constantes globales.
- Nombres de archivos y carpetas: kebab-case (`login-form.tsx` exporta `LoginForm`), salvo los nombres reservados de Next.js (`page.tsx`, `layout.tsx`, `proxy.ts`, `[param]`, `(grupo)`).
- Rutas URL: en inglés (`/login`, `/signup`, `/dashboard`), coherentes con los nombres de carpetas.
- Base de datos: snake_case; tablas en plural (`calendars`), columnas en singular (`owner_id`); toda tabla con `created_at` y, si es editable, `updated_at`; cambios de esquema solo mediante migraciones en `supabase/migrations/`, nunca editando a mano en el panel de Supabase.
- Fechas: se guardan como `timestamptz` (UTC) y se muestran en la zona horaria del usuario.
- Estructura: `docs/` (constitución y docs generales), `specs/NNN-nombre/` (`spec.md`, `plan.md`, `tasks.md`), `src/` (código de la app), `tests/unit/` y `tests/integration/`, `supabase/migrations/`, `public/` (iconos, service worker). Los ficheros de configuración de herramientas viven en la raíz.
- Idioma: español en docs, specs, mensajes de commit y textos visibles para el usuario (incluidos errores); inglés en identificadores de código, nombres de archivos y comentarios técnicos. Se verifica en revisión del diff.
- Git: rama `main` desplegable siempre; una rama por spec (`001-base-aplicacion`); commits pequeños con prefijo Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`) y referencia a la tarea (`feat: registro de usuario (T7)`).
- Variables de entorno: documentadas en `.env.example` sin valores reales; los valores viven en `.env.local` (ignorado por git) y en el panel de Vercel.

## Identidad visual y diseño de interfaz

La interfaz deja de ser la plantilla por defecto (azul sobre blanco) y adopta un estilo propio, sobrio y editorial, inspirado en la imagen de referencia `docs/referencia.jpg`. Esa imagen es **solo local**: está en `.gitignore`, no se sube a GitHub ni se copia en el código, y si falta, esta sección es la fuente de verdad. Se toma de ella el lenguaje visual, no sus pantallas ni sus funciones.

### Qué se toma de la referencia

- **Fondo piedra cálido y paneles un tono más claros.** La pantalla es un plano de color piedra; la barra lateral y los paneles se separan por un escalón de tono, no por sombras. Tinta casi negra para el texto y gris cálido para lo secundario.
- **El número del día como protagonista.** Las vistas semana y día ponen el número del día en grande sobre la rejilla, y en la agenda el día se compone como en Google Calendar: abreviatura arriba y número debajo, a la izquierda de los eventos. El día de hoy lleva el número en un círculo relleno del acento (enmienda 4, spec 016; sustituye al número gigante de la agenda de la spec 005).
- **Eventos como bloques rellenos** (enmienda 4, 2026-10-30, spec 016, aprobada por el usuario; sustituye a "eventos como filas de texto" y a la excepción de la spec 008). En las vistas mes, semana, día y agenda, y en todas las anchuras, cada evento es un bloque relleno con el color pastel del evento o de su calendario, como en Google Calendar. El texto va en tinta y el título en negrita, en los dos temas. Toda la paleta tiene un contraste ≥ 4,5:1 con la tinta (`palette.test.ts`). El título siempre es visible, aunque esté recortado, para que la información no dependa solo del color. Fuera de los bloques de evento, el color del calendario sigue siendo solo una marca (puntos del mini calendario, avatares, listas).
- **Un único color de acento para "ahora" y "hoy":** el día de hoy en el mini calendario (cuadrado relleno), la línea de la hora actual, las abreviaturas de los días y el elemento seleccionado. En nada más.
- **Botones de acción en negro**, totalmente redondos (píldora o círculo), con texto blanco; los secundarios, sin relleno o en el tono del panel. El botón flotante "+" (crear evento) es un círculo negro.
- **Mini calendario mensual** compacto con puntos de color bajo los días que tienen eventos (un punto por calendario, máximo tres).
- **Personas como avatares circulares** (iniciales sobre un tinte pálido propio de cada persona, porque la app no guarda fotos), usados en el filtro por persona y en la lista de miembros.
- **Una superficie de color pleno por pantalla como máximo**, para lo más urgente (p. ej. el próximo evento con su cuenta atrás), en lugar de tarjetas iguales. Los bloques de evento rellenos del calendario no cuentan para este límite (enmienda 4).
- **Escritorio en columnas** (navegación estrecha, panel con mini calendario y listas, área principal de agenda) y **móvil como Google Calendar** (enmienda 4, spec 016; sustituye a la barra inferior). Hasta 768 px hay:
  - una cabecera superior con el botón de menú, el título de la pantalla (en el calendario, el mes, que se despliega), "Hoy" y el avatar;
  - un cajón lateral con las vistas, los filtros y el resto de destinos;
  - el botón flotante "+" en tinta en el calendario, y el contenido a ancho completo.
- **Banda del mes en la agenda** (enmienda 4): cada mes empieza con una banda alta con su nombre sobre un degradado suave de tokens, igual en todos los meses. Nunca con ilustraciones ni imágenes de Google.

### Qué se ignora de la referencia

Su contenido y sus funciones, que no existen en la app ni están en su alcance: notas de voz, temporizador, documentos, tareas, integraciones con terceros, videollamadas y fotos de perfil. También sus restos de plantilla: emojis como iconos, textos en inglés y la marca "SAI".

### Color

- Tokens orientativos medidos sobre la referencia (el plan de la spec 005 fija los valores finales y comprueba su contraste): fondo `stone` ≈ `#E8E5DD`, panel `paper` ≈ `#F2F0EA`, tinta `ink` ≈ `#141414`, texto secundario `muted` lo bastante oscuro para 4,5:1 sobre `paper` (≈ `#66635D`), líneas `line` ≈ `#DAD6CC`.
- **Color de acento elegido por el usuario** entre seis: rojo (el de la referencia, por defecto), azul, verde, amarillo, morado y gris. Cada acento define a la vez su relleno, el color del texto que va encima y su variante para texto o líneas sobre el fondo, de modo que los seis cumplen P9 (el amarillo, por ejemplo, nunca se usa como texto sobre fondo claro y lleva tinta encima).
- El acento de la interfaz y los **colores de los calendarios** (paleta pastel cerrada de la spec 002) son cosas distintas: los calendarios colorean datos (barras, puntos, avatares); el acento marca "hoy", "ahora" y la selección. La información nunca depende solo del color (hoy también va en negrita o con relleno; los estados llevan texto).
- **Tema claro y tema oscuro** (enmienda 3): el usuario elige claro, oscuro o "como el sistema" desde la interfaz, y la elección se guarda por usuario. Cada token neutro y cada acento tiene su valor en los dos temas, con el contraste de P9 comprobado en un test. Los colores pastel de los calendarios se conservan en los dos temas; en el oscuro, el texto que va sobre ellos sigue en tinta oscura.

### Tipografía, forma y espacio

- **Una sola familia neo-grotesca** cargada con `next/font` (sin dependencias nuevas), con pesos del 400 al 800 y cifras tabulares (`tabular-nums`) en horas, fechas y contadores. La elige el plan de la spec 005. Sin monoespaciada.
- Escala corta: pocas tallas visibles (orientativo 12/14/16/20/28) más el número del día gigante. Títulos de pantalla de 20 a 32 px; mayúsculas solo al inicio de frase.
- Radios decididos una vez: paneles con radio medio (≈ 16 px), controles y botones totalmente redondos.
- Márgenes laterales de 16 px en móvil y una rejilla única en escritorio; el espacio entre bloques es mayor que el espacio dentro de ellos.
- **Movimiento** (enmienda 3): microinteracciones en botones y controles (pulsar, pasar por encima, foco), apertura y cierre de ventanas y hojas, y transiciones al cambiar de vista (agenda, mes, semana, día), de periodo, de calendario visible y de tema. Cada animación dura como mucho 400 ms, solo anima `transform`, `opacity` o `filter`, y con `prefers-reduced-motion: reduce` se sustituye por un cambio inmediato o un fundido.
- **Transparencias y profundidad** (enmienda 3): los contenedores principales (barra lateral, cabecera superior del móvil, cajón, paneles, ventanas, hojas y avisos) pueden ser superficies translúcidas con desenfoque de fondo (`backdrop-filter`), borde fino y sombra suave, definidas como tokens. Debajo del cristal el contraste del texto se mide contra el peor fondo posible y cumple P9; sin soporte de `backdrop-filter`, la superficie es opaca. Se permiten degradados suaves como fondo de la pantalla o de esas superficies, también como tokens.

### Prohibido en la interfaz

Colores, sombras, desenfoques o degradados sueltos que no sean tokens; texto sobre cristal o degradado sin contraste comprobado; emojis; iconos dentro de cuadrados o círculos de color; filas de tarjetas idénticas con icono encima; etiquetas pequeñas en mayúsculas con espaciado; etiquetas o "píldoras" encima de un título; textos de relleno (lorem ipsum, "Usuario 1"); el acento en todos los botones o en la navegación; más de un color de acento en pantalla; y paletas violeta/índigo como base (el morado solo existe como acento elegido por el usuario).

### Cómo se trabaja la interfaz

- Los componentes de `src/components/ui/` son la única fuente de botones, campos y avisos; una variante nueva se añade ahí, no en la página.
- Para diseñar o revisar pantallas se usan las skills `design-taste-frontend` (reglas de pantallas de aplicación, `references/app-screens.md`), `frontend-design` y `web-design-guidelines`.
- Ninguna librería de componentes, iconos o animación sin aprobación en la spec que la introduce (P6); los iconos se dibujan como SVG propios en línea, de trazo fino y un solo estilo.

### Interacción del calendario (spec 008)

El calendario se comporta como Google Calendar para que quien lo conozca lo entienda sin explicación. Se estudió con REA (`specs/008-mejoras-de-experiencia/analisis-google-calendar.md`) **solo su comportamiento**: no se copia código, estilos, iconos ni imágenes de Google, y su aspecto sigue siendo el de esta sección.

- **Crear sin salir del calendario.** Un hueco vacío (o un arrastre con ratón en semana y día) abre una **ventana rápida** junto al hueco (título, día y horas, calendario); "Más opciones" lleva al formulario completo con lo escrito. El alta, el detalle y la edición se abren en una **ventana sobre el calendario**, a pantalla completa en el móvil; el enlace o la recarga muestran la página completa. Desde la enmienda 5 (spec 017), el **detalle** se abre en el móvil en una **hoja inferior** a media pantalla, que se amplía o se cierra deslizándola; el alta y la edición siguen a pantalla completa.
- **Atajos sin modificadores** (N, T, ←, →, A, M, S, D y, desde la 017, E, G, Supr y ?), nunca mientras se escribe ni con una ventana abierta, y visibles en los botones de vista o en la ayuda de atajos. Los únicos atajos con modificador son Ctrl/Cmd+C y Ctrl/Cmd+V para copiar y pegar un evento, y Alt + flechas para moverlo (enmienda 5).
- **Mover y redimensionar** (enmienda 5, spec 017): los eventos se arrastran con el ratón o, en táctil, tras mantenerlos pulsados 500 ms. Al soltar se guardan sin confirmación. Todo lo que se hace arrastrando se puede hacer también con el teclado.
- **Menú contextual** (enmienda 5): solo con ratón o teclado, con la paleta de colores, "Duplicar" y "Borrar". Sin menú en pantallas táctiles.
- **Horas como combobox**: se escriben o se eligen de una lista de 30 en 30 minutos; la de fin muestra la duración y sigue a la de inicio.
- **Aviso breve** abajo tras guardar, borrar o duplicar, que se anuncia a los lectores de pantalla. Desde la enmienda 5 (spec 017), el aviso de mover, redimensionar, cambiar el color, pegar o borrar un evento ofrece "Deshacer" durante 10 s, solo para la última acción. Borrar un solo evento ya no pide confirmación.
- Lo que flota (la ventana de evento, la ventana rápida, la lista de horas, el aviso, los diálogos, el cajón, el botón flotante "+" y los tooltips) lleva la sombra de "flotante"; las superficies en reposo, como mucho la sombra suave de las transparencias. La guardia `design-tokens.test.ts` mantiene los tokens de sombra.
- **Gestos del móvil** (enmienda 4, spec 016): deslizar a izquierda o derecha en mes, semana y día cambia de periodo; la agenda es una lista continua. Todo lo que se hace deslizando también se puede hacer con un control o un atajo.
- **Pellizcar para ampliar** (enmienda 5): en semana y día, pellizcar o Ctrl + rueda cambia la altura de las horas, recordada por dispositivo.
- Fuera de alcance: arrastrar a otro periodo o a otro calendario, seleccionar varios eventos y deshacer más de una acción.

## Verificación obligatoria

Checklist que cierra cada tarea (se reporta la salida de cada comando):

- [ ] Tipos sin errores: `npm run typecheck`
- [ ] Lint sin errores: `npm run lint`
- [ ] Formato correcto: `npm run format:check`
- [ ] Tests unitarios y de componentes en verde: `npm test`
- [ ] Tests de base de datos y permisos en verde: `npm run test:db` (obligatorio si la tarea toca esquema, RLS o acceso a datos; ver P3)
- [ ] Build de producción sin errores: `npm run build`
- [ ] Prueba manual en móvil (≤ 768 px) y escritorio si la tarea toca interfaz (ver P5)
- [ ] Si la tarea toca interfaz: capturas a 390, 768 y 1440 px en tema claro y oscuro revisadas contra "Identidad visual y diseño de interfaz", contraste comprobado con los seis acentos en los dos temas y movimiento revisado con `prefers-reduced-motion` (ver P9)
- [ ] Aprobación explícita del usuario antes de pasar de fase (spec → plan → tareas → implementación) y al cerrar cada spec

## Dudas abiertas

- Las decisiones de stack de esta versión (Next.js 16 + Supabase Free + Vercel Hobby + Tailwind CSS 4) fueron confirmadas por el usuario en la spec 001.
- Resueltas en la spec 005: la tipografía es Inter Tight; los valores de los seis acentos y de los neutros están en `src/lib/theme/accents.ts` (con su contraste comprobado en `accents.test.ts`); y el acento se guarda por usuario en `profiles.accent`, así que se ve igual en todos sus dispositivos.
- Enmienda 3 (2026-10-29, aprobada por el usuario): nombre CaFam en todas partes, tema oscuro, transparencias, sombras, degradados y animaciones, Supabase Storage, `ical.js` para repeticiones, asistente de chat con un proveedor LLM gratuito y excepción de cambio de nombre en las specs cerradas. Las enmiendas 1 y 2 están en la spec 007.
- Enmienda 4 (2026-10-30, aprobada por el usuario con la spec 016): eventos como bloques rellenos en todas las vistas, composición del móvil al estilo Google Calendar (cabecera, cajón y botón flotante, sin barra inferior), día de la agenda al estilo Google y banda del mes con degradado.
- Enmienda 5 (2026-10-30, aprobada por el usuario con la spec 017): mover y redimensionar eventos arrastrando, menú contextual en el ordenador, "Deshacer" en los avisos (y borrar un evento sin confirmación), detalle en hoja inferior en el móvil, pellizcar para ampliar y atajos nuevos (E, G, Supr, ?, Ctrl/Cmd+C/V y Alt + flechas).
- Enmienda 6 (2026-11-01, aprobada por el usuario con la spec 018): iCloud por CalDAV como servicio externo aceptado, `tsdav` como dependencia de producción del servidor y las contraseñas específicas de app de iCloud entre los secretos de P4.
- Resuelta en la spec 015: una persona consiente que el asistente use su disponibilidad con un ajuste propio, desactivado por defecto.
