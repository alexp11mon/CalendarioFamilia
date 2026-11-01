# Spec 018 — Sincronización con iCloud (calendarios del iPhone)

> Estado: **Aprobada** (2026-11-01) por el usuario. La enmienda 6 de la constitución se aplicó al aprobarla.
> Parte de las specs 007 (sincronización con Google, cuentas conectadas y grupos) y 009 (escritura en Google), cerradas. Su objetivo es que los calendarios de iCloud funcionen en CaFam igual que los de Google. Lo que no se dice aquí sigue las reglas de la 007 y la 009 para Google, aplicadas a iCloud. Constitución: `docs/constitution.md` (P9 para lo visual).
> Decisiones del usuario (2026-11-01):
>
> - **Mismo alcance que Google**: ver, crear, cambiar, mover y borrar eventos, renombrar calendarios, crear calendarios en iCloud y subir calendarios de CaFam.
> - **Dependencia aprobada:** un cliente CalDAV, `tsdav` (licencia MIT, versión 2.5.0). Se instala en la primera tarea del plan, no antes (P6 y P7).
> - El resto se decide por coherencia con Google: escriben el propietario y los Editores; si iCloud no acepta un cambio, no se guarda; gana el último cambio; una repetición se cambia sola.
>
> Lo que se sabe de iCloud (investigación del 2026-11-01):
>
> - Apple no ofrece OAuth ni una API REST para los calendarios. El único acceso es CalDAV (`caldav.icloud.com`), con el Apple ID y una **contraseña específica de app**.
> - Para crear esa contraseña la cuenta tiene que tener la verificación en dos pasos. Se crea a mano en account.apple.com, con un máximo de 25 activas por cuenta.
> - Las contraseñas específicas de app se revocan solas cuando el usuario cambia o restablece la contraseña de su Apple ID, sin ningún aviso. Además, cualquiera de ellas da acceso al correo, los contactos y los calendarios de iCloud, no solo al calendario.
> - iCloud no avisa de los cambios a apps de terceros, así que hay que consultarlo cada cierto tiempo. Apple no publica sus límites de peticiones.
> - Los calendarios guardados "En mi iPhone", las suscripciones (`webcal`) y los cumpleaños de Contactos no están en iCloud y no se pueden traer.
> - Cambiar un evento en iCloud supone reescribirlo entero: no hay cambios parciales como en Google.

## Contexto y objetivo

Hoy CaFam trae y edita los calendarios de Google (specs 007 y 009). Pero muchos miembros de la familia usan el iPhone, y sus calendarios viven en iCloud: para verlos en CaFam solo tienen la importación única de un `.ics` (spec 004), que se queda congelada. Esta spec permite conectar una cuenta de iCloud, elegir qué calendarios traer, mantenerlos al día y escribir en ellos desde CaFam, igual que con Google. Así toda la familia se organiza en un solo sitio, use Android, iPhone o el ordenador.

## Usuarios / actores

- **Propietario:** conecta su cuenta de iCloud con una contraseña específica de app, elige los calendarios, los actualiza, escribe en ellos, los renombra, crea calendarios en iCloud, sube calendarios de CaFam y desconecta la cuenta.
- **Editor de un calendario traído de iCloud:** crea, cambia, mueve y borra sus eventos. Los cambios llegan a la cuenta de iCloud del propietario.
- **Lector de un calendario traído de iCloud:** solo lo ve.
- **iCloud:** recibe y entrega los datos. Puede rechazar la contraseña, no responder o limitar las peticiones.
- **Visitante sin sesión:** lee en la política de privacidad qué hace CaFam con los datos de iCloud.

## Historias de usuario

- H1: Como usuario de iPhone quiero conectar mi cuenta de iCloud para ver mis calendarios en CaFam.
- H2: Como usuario quiero elegir qué calendarios de iCloud se traen y cambiar esa elección más tarde.
- H3: Como usuario quiero que los calendarios de iCloud se actualicen solos, y poder actualizarlos a mano cuando acabo de cambiar algo en el iPhone.
- H4: Como propietario o Editor quiero crear, cambiar, mover y borrar en CaFam los eventos de un calendario de iCloud y verlos en el iPhone.
- H5: Como propietario quiero renombrar un calendario de iCloud, crear uno nuevo en iCloud y subir un calendario de CaFam a iCloud.
- H6: Como usuario quiero saber que un cambio no se ha guardado si iCloud no lo ha aceptado.
- H7: Como usuario quiero saber qué tengo que hacer cuando la contraseña específica de app deja de valer.
- H8: Como usuario quiero desconectar la cuenta y decidir si me quedo con los calendarios traídos o los borro.

## Requisitos funcionales (criterios de aceptación en EARS)

### Conectar una cuenta

- RF-1: EL SISTEMA ofrecerá "Conectar iCloud" en "Cuentas conectadas", junto a "Conectar Google".
- RF-2: CUANDO el usuario pide conectar iCloud, EL SISTEMA le mostrará antes un aviso en español que explique que hace falta una contraseña específica de app, que para crearla la cuenta tiene que tener la verificación en dos pasos, y los pasos para crearla en account.apple.com.
- RF-3: EL SISTEMA indicará en ese aviso que la contraseña específica de app también da acceso al correo y a los contactos de iCloud, que CaFam solo usa los calendarios y que la contraseña se puede revocar en cualquier momento desde la cuenta de Apple.
- RF-4: EL SISTEMA enlazará la política de privacidad desde ese aviso.
- RF-5: CUANDO el usuario escribe su Apple ID y una contraseña específica de app válidos, EL SISTEMA conectará la cuenta, la mostrará como "iCloud" con su Apple ID y le pedirá elegir calendarios.
- RF-6: SI iCloud rechaza el Apple ID o la contraseña, ENTONCES EL SISTEMA no conectará la cuenta y explicará en español que hace falta una contraseña específica de app y no la contraseña normal del Apple ID.
- RF-7: SI la conexión falla, ENTONCES EL SISTEMA conservará el Apple ID escrito y dejará vacía la contraseña.
- RF-8: SI iCloud no responde al conectar, ENTONCES EL SISTEMA no conectará la cuenta y dirá en español que iCloud no responde y que se puede volver a intentar.
- RF-9: SI el usuario ya tenía conectada esa misma cuenta de iCloud, ENTONCES EL SISTEMA guardará la contraseña nueva en lugar de la anterior, sin crear otra conexión ni duplicar calendarios, y reanudará su actualización.
- RF-10: SI otro usuario de CaFam ya conectó la misma cuenta de iCloud, ENTONCES EL SISTEMA permitirá la conexión de forma independiente, sin compartir nada entre los dos usuarios.
- RF-11: EL SISTEMA permitirá como máximo 5 cuentas conectadas por usuario, sumando las de Google y las de iCloud, y SI se supera, ENTONCES lo rechazará con un mensaje que explique el límite.
- RF-12: EL SISTEMA nunca volverá a mostrar la contraseña específica de app ni la enviará al navegador después de conectar.

### Elegir calendarios

- RF-13: CUANDO la cuenta está conectada, EL SISTEMA mostrará los calendarios de eventos de esa cuenta de iCloud con su nombre y su color, para marcar cuáles traer.
- RF-14: EL SISTEMA no ofrecerá las listas de iCloud que solo guardan tareas (Recordatorios).
- RF-15: CUANDO el usuario marca un calendario y confirma, EL SISTEMA creará un calendario nuevo en CaFam, propiedad del usuario, con su nombre y el color más cercano de la paleta de CaFam, y traerá sus eventos.
- RF-16: CUANDO el usuario desmarca un calendario ya traído, EL SISTEMA pedirá confirmación y, tras ella, dejará de traerlo y aplicará la elección de conservar o borrar del RF-65.
- RF-17: CUANDO el usuario vuelve a la ficha de la cuenta, EL SISTEMA mostrará la lista actual de sus calendarios, incluidos los creados después de conectarla.
- RF-18: EL SISTEMA permitirá traer como máximo 20 calendarios por cuenta de iCloud, contando los creados o subidos desde CaFam.
- RF-19: SI un calendario traído se borra en iCloud, ENTONCES EL SISTEMA lo marcará como "ya no existe en la cuenta" y dejará de actualizarlo, sin borrarlo de CaFam.
- RF-20: SI la cuenta de iCloud solo puede leer un calendario (por ejemplo, uno que otra persona le compartió en iCloud sin permiso de cambios), ENTONCES EL SISTEMA lo mantendrá de solo lectura en CaFam y lo indicará como "Solo lectura en iCloud".

### Eventos traídos

- RF-21: EL SISTEMA traerá los eventos desde 6 meses antes de hoy hasta 1 año después de hoy.
- RF-22: EL SISTEMA traerá cada repetición de un evento repetido de iCloud como un evento suelto, respetando las repeticiones borradas y las modificadas en iCloud.
- RF-23: EL SISTEMA no traerá los eventos cancelados.
- RF-24: EL SISTEMA traerá de cada evento el título, el inicio, el fin, si es de día completo, la descripción y el lugar, con las reglas de día completo y de zona horaria de la importación `.ics` (spec 004).
- RF-25: SI un evento tiene una zona horaria que el sistema no reconoce o un fin anterior al inicio, ENTONCES EL SISTEMA lo omitirá y lo contará en el resumen de la actualización.
- RF-26: EL SISTEMA traerá como máximo 2.000 eventos por calendario y, SI el rango tiene más, ENTONCES traerá los más cercanos a hoy y avisará de que ha omitido el resto.
- RF-27: EL SISTEMA permitirá añadir imágenes y comentarios a los eventos de un calendario de iCloud, como en los de Google, y nunca los enviará a iCloud.
- RF-28: EL SISTEMA no ofrecerá crear eventos repetidos ("Repetir") en un calendario de iCloud, como en uno de Google, e indicará el motivo.

### Actualizar

- RF-29: EL SISTEMA actualizará cada calendario de iCloud traído de forma automática al menos cada 6 horas.
- RF-30: CUANDO el usuario pulsa "Actualizar ahora" en una cuenta de iCloud, EL SISTEMA actualizará sus calendarios traídos y mostrará cuándo terminó y cuántos eventos se añadieron, cambiaron, quitaron u omitieron.
- RF-31: SI el usuario pulsa "Actualizar ahora" menos de 5 minutos después de la última actualización de la cuenta, ENTONCES EL SISTEMA no volverá a consultar iCloud e indicará cuándo podrá hacerlo.
- RF-32: EN cada actualización, EL SISTEMA añadirá los eventos nuevos de iCloud, modificará los cambiados y quitará los borrados o los que salgan del rango.
- RF-33: EL SISTEMA mostrará en cada calendario de iCloud traído su última actualización correcta y, solo al propietario, su cuenta de origen.

### Escribir en iCloud

- RF-34: EL SISTEMA permitirá al propietario y a los Editores de un calendario de iCloud traído crear, cambiar y borrar sus eventos, salvo en los de solo lectura (RF-20).
- RF-35: EL SISTEMA no permitirá a un Lector escribir en un calendario de iCloud traído.
- RF-36: EL SISTEMA ofrecerá los calendarios de iCloud en los que el usuario puede escribir como destino al crear, cambiar y duplicar un evento, en el formulario, en la ventana rápida y al arrastrar sobre la rejilla.
- RF-37: CUANDO alguien crea, cambia o borra un evento de un calendario de iCloud, EL SISTEMA aplicará el cambio primero en iCloud y después en CaFam.
- RF-38: EL SISTEMA escribirá en iCloud el título, el inicio, el fin, si es de día completo, la descripción y el lugar del evento.
- RF-39: CUANDO alguien cambia un evento, EL SISTEMA conservará en iCloud los datos que CaFam no muestra (alertas, invitados, enlace y adjuntos) y los campos que no se han cambiado en CaFam.
- RF-40: CUANDO alguien cambia o borra en CaFam una repetición de un evento repetido de iCloud, EL SISTEMA cambiará o borrará en iCloud solo esa repetición.
- RF-41: CUANDO alguien mueve un evento entre dos calendarios traídos de la misma cuenta de iCloud, EL SISTEMA lo moverá también en iCloud.
- RF-42: EL SISTEMA no ofrecerá mover un evento entre un calendario de iCloud y uno de otra cuenta (de iCloud o de Google) o uno normal, en ninguno de los dos sentidos.
- RF-43: CUANDO iCloud acepta el cambio, EL SISTEMA mostrará el mismo aviso breve que en un calendario normal ("Evento creado", "Cambios guardados" o "Evento borrado").
- RF-44: EL SISTEMA conservará en CaFam la categoría y el color de cada evento cuando llegue una actualización de iCloud, y nunca los enviará a iCloud.

### Errores al escribir y conflictos

- RF-45: SI iCloud no acepta un cambio, ENTONCES EL SISTEMA no lo guardará en CaFam, dejará el evento como estaba y conservará lo escrito en el formulario.
- RF-46: SI iCloud no responde en 10 segundos al escribir, ENTONCES EL SISTEMA dirá en español que iCloud no responde y que se puede volver a intentar.
- RF-47: SI iCloud rechaza el cambio por falta de permiso, ENTONCES EL SISTEMA dirá en español que iCloud no ha permitido el cambio.
- RF-48: SI el evento que se cambia o se borra en CaFam ya no existe en iCloud, ENTONCES EL SISTEMA lo quitará de CaFam y avisará de que se borró en iCloud, sin guardar el cambio.
- RF-49: SI un evento cambió en iCloud después de la última actualización y alguien lo cambia en CaFam, ENTONCES EL SISTEMA guardará en iCloud y en CaFam el cambio hecho en CaFam, porque es el último.
- RF-50: CUANDO una actualización trae de iCloud un cambio posterior al último hecho en CaFam, EL SISTEMA aplicará el de iCloud en CaFam.
- RF-51: EL SISTEMA no mostrará al usuario mensajes técnicos de iCloud.

### Calendarios

- RF-52: CUANDO el propietario renombra un calendario de iCloud traído, EL SISTEMA lo renombrará también en iCloud y, SI iCloud no lo acepta, ENTONCES no lo guardará en CaFam y lo explicará con los mensajes de RF-46 y RF-47.
- RF-53: EL SISTEMA no enviará a iCloud el color ni la descripción de un calendario, que siguen siendo solo de CaFam.
- RF-54: CUANDO el propietario crea desde CaFam un calendario nuevo en una cuenta de iCloud conectada, EL SISTEMA lo creará en iCloud con el nombre elegido y lo traerá a CaFam como calendario traído.
- RF-55: CUANDO el propietario sube a una cuenta de iCloud conectada un calendario normal suyo de CaFam, EL SISTEMA creará un calendario en iCloud con el mismo nombre, copiará sus eventos y lo convertirá en un calendario traído de esa cuenta.
- RF-56: EL SISTEMA copiará a iCloud, al subir un calendario, solo los eventos del rango del RF-21, hasta 2.000, y conservará en CaFam el resto sin que las actualizaciones lo quiten.
- RF-57: ANTES de subir un calendario, EL SISTEMA indicará cuántos eventos se copiarán a iCloud y cuántos se quedarán solo en CaFam.
- RF-58: CUANDO se sube un calendario, EL SISTEMA conservará en CaFam sus miembros, sus categorías, sus imágenes, sus comentarios y el color y la categoría de cada evento.
- RF-59: SI la subida falla antes de terminar, ENTONCES EL SISTEMA dejará el calendario de CaFam como estaba, borrará de iCloud lo que acababa de crear y explicará el fallo.
- RF-60: EL SISTEMA no permitirá subir un calendario sin propietario, uno ya traído ni uno del que el usuario no es propietario.

### Errores de la cuenta, desconectar y privacidad

- RF-61: SI iCloud deja de aceptar la contraseña guardada (por ejemplo, porque el usuario cambió la contraseña de su Apple ID o la revocó), ENTONCES EL SISTEMA dejará de actualizar esa cuenta y conservará sus calendarios sin cambios.
- RF-62: En ese caso del RF-61, EL SISTEMA avisará al propietario en "Mis calendarios" y en la ficha de la cuenta, le explicará que cambiar la contraseña del Apple ID invalida las contraseñas específicas de app y le ofrecerá "Volver a conectar" con una nueva.
- RF-63: SI una actualización falla de forma temporal (iCloud no responde o limita las peticiones), ENTONCES EL SISTEMA conservará los datos anteriores, lo reintentará en la siguiente actualización automática y mostrará en la cuenta que la última falló.
- RF-64: SI la actualización de una cuenta de iCloud falla 3 veces seguidas, ENTONCES EL SISTEMA avisará al propietario en la aplicación.
- RF-65: CUANDO el usuario desconecta una cuenta de iCloud, EL SISTEMA le preguntará si quiere conservar los calendarios traídos como calendarios normales y editables o borrarlos, indicando cuántos calendarios afecta y cuáles están compartidos y con cuántas personas.
- RF-66: CUANDO el usuario desconecta una cuenta de iCloud, EL SISTEMA borrará la contraseña guardada.
- RF-67: CUANDO el usuario desconecta una cuenta de iCloud, EL SISTEMA le recordará que revoque la contraseña específica de app en su cuenta de Apple, porque CaFam no puede revocarla.
- RF-68: EL SISTEMA no borrará ningún calendario en iCloud al desmarcarlo, desconectarlo o borrarlo en CaFam, salvo lo creado durante una subida fallida (RF-59).
- RF-69: EL SISTEMA explicará en la política de privacidad pública qué datos de iCloud se leen y se escriben, para qué, dónde se guarda la contraseña específica de app, con quién se comparten y cómo revocarla y borrar los datos.
- RF-70: EL SISTEMA aplicará a los calendarios de iCloud las mismas reglas que a los de Google para los grupos, "juntar calendarios" (no se pueden juntar mientras son traídos), los calendarios sin propietario y el borrado de la cuenta (specs 006 y 007).

## Requisitos no funcionales

- **Privacidad y seguridad (P3 y P4):** la contraseña específica de app solo se guarda cifrada en el servidor. Nunca llega al navegador, a otros usuarios ni a los registros. Ningún usuario puede ver ni usar la conexión de otro. Que un Editor escriba en la cuenta de iCloud del propietario no le da acceso a esa cuenta ni a otros calendarios suyos. CaFam solo habla con los servidores de iCloud de Apple, nunca con otros que indique una respuesta.
- **Datos mínimos:** CaFam solo lee y guarda los calendarios elegidos y sus eventos. No lee el correo, los contactos ni los recordatorios, aunque la contraseña lo permita.
- **Base de datos como frontera (P3):** quién puede escribir en un calendario de iCloud se decide igual que en uno de Google y lo impone la base de datos.
- **Coste cero (P2):** CalDAV de iCloud es gratuito, no exige registrar ninguna aplicación en Apple ni tener una tarjeta, y entra en la cuenta de iCloud gratuita del usuario. Como Apple no publica sus límites de peticiones, la frecuencia de actualización no superará la de Google.
- **Dependencias (P6):** el usuario aprobó el 2026-11-01 el cliente CalDAV `tsdav` (MIT). Se usa solo en el servidor. Ninguna otra dependencia nueva sin aprobación expresa.
- **Constitución:** la enmienda 6 (aplicada el 2026-11-01) acepta iCloud (CalDAV) como servicio externo, `tsdav` como dependencia de producción y las contraseñas específicas de app entre los secretos de P4.
- **Tiempo de respuesta:** guardar un evento en un calendario de iCloud responde en menos de 10 segundos (RF-46). Actualizar un calendario de hasta 2.000 eventos termina en menos de 60 segundos.
- **Identidad visual (P9):** las pantallas nuevas y las cambiadas siguen la constitución, con capturas a 390, 768 y 1440 px en los dos temas y con el acento rojo y el amarillo. No se usan el logotipo, los iconos ni la marca de Apple, solo el texto "iCloud".
- **Idioma:** textos, errores, el aviso previo y la política de privacidad en español.
- **Accesibilidad:** todo se puede hacer con teclado, cada campo tiene su etiqueta y los errores se anuncian a los lectores de pantalla.

## Casos límite

- El usuario pega la contraseña con espacios o guiones, como la muestra Apple (`abcd-efgh-ijkl-mnop`): se acepta.
- El usuario escribe su contraseña normal del Apple ID: iCloud la rechaza y se aplica el RF-6.
- El Apple ID no es un correo de iCloud (por ejemplo, uno de Gmail usado como Apple ID): se acepta igual.
- La cuenta de iCloud no tiene ningún calendario de eventos: se conecta y la lista sale vacía, con la opción de crear uno (RF-54).
- El usuario cambia la contraseña de su Apple ID: la siguiente actualización o escritura falla y se aplica el RF-61.
- Un evento se cambia en el iPhone y en CaFam casi a la vez: gana el último que se guarda (RF-49 y RF-50).
- Un evento de iCloud tiene invitados o lo organiza otra persona: iCloud puede rechazar el cambio, y entonces se aplica el RF-47.
- La misma cuenta de iCloud está conectada por dos usuarios de CaFam: cada uno trae sus calendarios por separado (RF-10).
- El mismo calendario de iCloud está compartido entre dos cuentas de iCloud conectadas por el mismo usuario: se trae dos veces como calendarios independientes.
- Un evento de día completo pasa a tener hora, o al revés: se escribe en iCloud con la regla de día completo de la spec 002.
- Una actualización automática llega mientras se crea un evento desde CaFam: el evento no se duplica.
- iCloud limita las peticiones o devuelve errores del servidor durante horas: se aplican los RF-63 y RF-64, sin perder datos.
- Un calendario creado o subido desde CaFam se desmarca o se desconecta: se aplica la elección de conservar o borrar en CaFam, y en iCloud no se borra nada (RF-68).

## Fuera de alcance

- Recordatorios (tareas), contactos, correo y notas de iCloud.
- Calendarios guardados solo "En mi iPhone", las suscripciones (`webcal`) y los cumpleaños de Contactos, que no están en iCloud. Las suscripciones se pueden seguir importando una vez con la spec 004.
- Conectar con "Iniciar sesión con Apple": no da acceso a los calendarios.
- Revocar la contraseña específica de app desde CaFam (RF-67).
- Crear o editar series repetidas en iCloud desde CaFam: solo se tocan repeticiones sueltas (RF-28 y RF-40).
- Invitados, respuestas, alertas, adjuntos y el color de los eventos de iCloud.
- Borrar calendarios en iCloud desde CaFam (RF-68).
- Mover eventos entre cuentas distintas o entre un calendario de iCloud y uno normal (RF-42).
- Guardar un cambio en CaFam y enviarlo a iCloud más tarde (cola de cambios pendientes).
- Actualización en tiempo real o con avisos de iCloud: el cambio llega en la siguiente actualización, automática o manual.
- Compartir calendarios en iCloud con otras personas de Apple desde CaFam.
- Otros servidores CalDAV (Nextcloud, Fastmail…) y Microsoft.
- Cambios en la sincronización con Google, salvo que el límite de 5 cuentas pasa a contar las dos (RF-11).

## Criterios de finalización

- Todos los RF con test en verde y la verificación de P8 (`typecheck`, `lint`, `format:check`, `test`, `build` y `test:db`).
- Tests del cliente de iCloud con respuestas sintéticas de CalDAV (nunca datos ni credenciales reales en el repositorio).
- Demo manual en producción con una cuenta real de iCloud y un iPhone:
  - conectar con una contraseña específica de app y elegir dos calendarios;
  - crear, cambiar, mover y borrar eventos en CaFam y verlos en el iPhone;
  - cambiar un evento en el iPhone y verlo en CaFam con "Actualizar ahora";
  - cambiar una repetición sola y comprobar que un Editor también puede escribir;
  - renombrar un calendario, crear uno en iCloud y subir uno de CaFam;
  - revocar la contraseña en la cuenta de Apple y ver el aviso de volver a conectar;
  - desconectar conservando un calendario y borrando otro.
- Revisión visual a 390, 768 y 1440 px en los dos temas, con el acento rojo y el amarillo (P9).
- `no-secrets` en verde y revisión del diff: ninguna contraseña de iCloud llega al navegador ni a los registros.
- Enmienda 6 aplicada en la constitución.
- Aprobación explícita del usuario para cerrar la spec.

## Dudas abiertas

- (Resuelta 2026-11-01: si al comprobarlo con una cuenta real iCloud no deja renombrar un calendario por CalDAV, el nombre de un calendario de iCloud no se podrá cambiar en CaFam y el RF-52 se sustituirá con una enmienda.)
- (Resuelta 2026-11-01: se traen solo los calendarios que iCloud entregue por CalDAV; el RF-20 se aplica a los compartidos que aparezcan. Si no aparecen, se aclara en el aviso previo.)
- (Resuelta 2026-11-01: la 018 va antes de la 015.)
- Apple no publica sus límites de peticiones. Se tratan como fallos temporales (RF-63) y el plan medirá cuántas peticiones hace una actualización.
- Una página de terceros dice que las contraseñas específicas de app caducan al año, pero Apple no lo confirma. Si ocurre, se aplica el RF-61.
