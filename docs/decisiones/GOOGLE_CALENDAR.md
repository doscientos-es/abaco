# Calendarios: Google y Outlook

## Estado comprobado: 26/11/2026

Google Calendar ya tiene interfaz en **Ajustes → Integraciones**, conexión OAuth,
almacenamiento, cola y funciones Edge para sincronizar. En el proyecto Supabase
de Ábaco están desplegadas las funciones de conexión y sincronización, el cron
está activo y hay una conexión registrada como conectada. No se ha comprobado
en esta revisión un evento real en Google: la conexión no tenía una última
sincronización registrada. La disponibilidad efectiva también depende de la
configuración de las funciones y de Google.

Outlook no está implementado. La integración y el contenido ampliado descritos
abajo son el alcance deseado, no funcionalidad disponible actualmente.

## Comportamiento actual de Google

- Cada persona conecta su propia cuenta por empresa; la conexión es independiente
  del inicio de sesión con Google. Se utiliza un calendario secundario de la cuenta.
- La sincronización va de Ábaco a Google, no en sentido contrario. La cola tiene
  disparo inmediato y un cron periódico para reintentos.
- Se proyectan las visitas programadas o en curso asignadas directamente a la
  persona o, si no hay asignación individual, a su equipo. Actualmente el evento
  contiene únicamente el horario, la zona y el título genérico «Visita Ábaco»;
  no contiene cliente, dirección, notas ni personas asignadas.
- Al desconectar se elimina la credencial guardada y se detiene la sincronización;
  los eventos ya creados permanecen en Google. El usuario puede borrarlos y retirar
  el permiso desde su cuenta.
- El worker actual elimina el evento cuando la visita deja de estar activa o
  asignada, incluidas las visitas finalizadas. Al reconectar reutiliza el ID del
  calendario anterior sin comprobar que pertenezca a la cuenta recién autorizada.

## Alcance deseado para Google y Outlook

Cada persona podrá conectar su calendario Google y/o Microsoft y ver sus visitas
asignadas. Los eventos deberían actualizarse al cambiar la visita o la asignación,
sin modificar Ábaco cuando se edite el evento externo. Se desea incluir:

- Un título identificable, adaptado al trabajo y al cliente.
- El sitio o dirección, las notas y las personas que van a la visita.
- Un enlace a los detalles en Ábaco, sujeto a la sesión y permisos del usuario.

Este contenido aún no se envía a Google ni existe una conexión con Outlook. Hay
que definir cómo mostrar las personas cuando hay asignación individual o de equipo,
qué notas son apropiadas para compartir y cómo acceder al detalle desde cada rol.
La sincronización debe reflejar también cambios en cliente, lugar, notas y equipo,
no solo cambios de horario o asignación en la visita.

## Privacidad y seguridad

El contenido de un evento puede ser visible para el propietario del calendario y
para quienes tengan acceso a sus detalles, aunque el evento se marque privado.
Clientes, direcciones y notas pueden ser sensibles. Antes de enviar esos datos,
informar claramente del nuevo contenido y obtener la aceptación adecuada, también
para las conexiones de Google existentes, que se ofrecieron con contenido genérico.

La sincronización debe comprobar en servidor la empresa, la pertenencia y la
asignación efectiva antes de enviar información. El acceso de oficina para ver
visitas no equivale a estar asignado. Ante una reasignación o pérdida de acceso,
hay que intentar retirar el evento y comunicar que pueden quedar copias si el
proveedor no está disponible o el permiso ha sido revocado. El enlace no debe
conceder acceso por sí mismo ni incluir datos sensibles o credenciales.

## OAuth y configuración de Google

El código solicita `https://www.googleapis.com/auth/calendar.app.created` para
crear un calendario secundario y gestionar sus eventos. Las funciones requieren
credenciales OAuth, la clave de cifrado, la URL de retorno y las opciones
`GOOGLE_CALENDAR_ENABLED` y `GOOGLE_CALENDAR_WORKER_ENABLED`. El proveedor Google
de Supabase Auth se configura por separado. No guardar secretos en el repositorio
ni en variables `VITE_*`.

La implementación usa `state` de un solo uso, PKCE, comprobación del permiso,
cifrado de la credencial ligado a empresa y usuario, y sesión verificada en el
servidor. La desconexión no revoca automáticamente el permiso en Google: hacerlo
podría afectar a otros vínculos de la misma cuenta con el mismo cliente OAuth.
Revisar las políticas de los proveedores y la configuración efectiva antes de
ampliar su uso.

## Trabajo pendiente

- Diseñar e implementar la conexión Microsoft, su consentimiento y permisos de
  calendario, el almacenamiento seguro de credenciales, la cola y la interfaz.
  Registrar la aplicación en Microsoft y probar con cuentas autorizadas antes de
  presentar Outlook como disponible.
- Ampliar la proyección de ambos proveedores y los disparadores de cambios,
  manteniendo aislamiento por empresa, usuario y visita, y evitando duplicados.
- Resolver la conservación de visitas finalizadas, las cancelaciones y la
  reconexión con una cuenta distinta. Definir el horizonte de sincronización y
  cómo comunicar retrasos y eventos residuales.
- Gestionar la creación incierta de calendarios secundarios y los conflictos o
  respuestas perdidas de eventos. Comprobar asignación y versión ante cambios
  concurrentes, y reconciliar las operaciones que no puedan confirmarse.
- Revisar permisos y políticas de los proveedores y probar OAuth, privacidad,
  asignaciones de equipo, cambios, desconexión y zonas horarias. Realizar pruebas
  reales de extremo a extremo con cuentas autorizadas, además de las simuladas.

## Referencias de Google

- [Permisos de Calendar](https://developers.google.com/workspace/calendar/api/auth)
- [Creación e IDs de eventos](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- [Permisos para listar calendarios](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list)
- [Versionado y ETag](https://developers.google.com/workspace/calendar/api/guides/version-resources)
- [Buenas prácticas OAuth](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Verificación y políticas OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)
