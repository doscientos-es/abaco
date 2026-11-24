# Google Calendar: preparación, no disponible

## Actualización: 24/11/2026

La conexión prevista es individual: cada persona autoriza su propia cuenta de
Google para cada empresa, y la sincronización es solo de Ábaco a Calendar. El
proyecto OAuth identifica la aplicación; no es la cuenta propietaria del calendario.
Solo se copia el horario con un título genérico, no los datos completos del trabajo.

La cola y el disparo inmediato están preparados en la base de datos, pero el
worker y OAuth aún no están desplegados, falta verificar la configuración de
Google y el cron de recuperación está pausado. Antes de activarlos hay que resolver la conservación de visitas
finalizadas como historial y el cambio de cuenta Google al reconectar: el worker
actual elimina eventos de visitas finalizadas y la reconexión reutiliza el ID del
calendario anterior sin verificar que pertenezca a la nueva cuenta autorizada.

Estado a 20/11/2026: **no hay conexión OAuth, sincronización ni controles de
Calendar disponibles en Ábaco**. `server/google-calendar` contiene código local
para OAuth, cifrado, proyección y llamadas a Google Calendar, probado con respuestas
simuladas. No está conectado a rutas, almacenamiento, cola ni interfaz; no verifica
asignaciones por sí mismo y no realiza sincronización. Sus pruebas no validan
Google ni un flujo real. No presentarlo como una integración funcional.

## Alcance y privacidad

La sincronización propuesta es unidireccional, con consentimiento por persona y
empresa, sin invitados ni datos de clientes, direcciones, notas o partes. La
proyección local solo contiene un título genérico, horario y zona. `private` no
impide que el propietario o personas autorizadas para ver detalles del calendario
puedan ver el evento: hay que informar al usuario de la visibilidad y de que el
horario mismo puede ser sensible. Nada asegura la retirada inmediata de una copia
cuando Google no está disponible o el acceso ha sido revocado.

Las visitas admiten asignación individual o de equipo. Según
`20261112115459_team_visit_permissions.sql`, la asignación individual prevalece;
si no existe, el acceso de técnicos y usuarios depende de la pertenencia actual
al equipo y del rol en la empresa. El futuro trabajador debe verificar en servidor
la asignación efectiva y pertenencia actuales, también ante cambios de equipo,
rol o empresa; los permisos de oficina para ver visitas no equivalen a asignación.
Usar únicamente el acceso de servicio sin este filtro expondría datos. Comprobar
la versión y aplicación reales de esas reglas antes de activarlo.

## OAuth y configuración pendiente

Se elige un calendario secundario creado por Ábaco con
`https://www.googleapis.com/auth/calendar.app.created`, que permite crear esos
calendarios y gestionar sus eventos. No solicitar acceso al calendario principal
ni permisos más amplios. Comprobar en un entorno de prueba los permisos exactos
de todas las operaciones elegidas y la clasificación actual del permiso en
Google Cloud antes de pedir consentimiento.

Se necesita un proyecto de Google Cloud autorizado, Calendar API, cliente OAuth
web, URL HTTPS de retorno exacta, pantalla de consentimiento y usuarios de prueba.
Las funciones Edge comparten `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET`;
el proveedor Google de Supabase Auth se configura por separado en Authentication.
La conexión y el worker requieren además `GOOGLE_CALENDAR_ENABLED=true` y
`GOOGLE_CALENDAR_WORKER_ENABLED=true`. No activar estas opciones hasta resolver los
problemas de conservación de visitas y reconexión descritos arriba.
Para uso público, revisar la verificación de marca y de permisos sensibles o
restringidos que corresponda, la política de privacidad y las condiciones de uso
de datos de Google; no se ha validado su cumplimiento. No guardar secretos en el
repositorio ni en variables `VITE_*`.

El código local usa `state` aleatorio, PKCE, caducidad y consumo único mediante
un almacén aún no implementado. Comprueba el permiso concedido y cifra el refresh
token con AES-GCM ligado a empresa y usuario. La conexión solo se guarda mediante
una operación que deberá comprobar transaccionalmente la pertenencia actual; la
rotación exige comparación atómica. La ruta futura debe obtener el usuario de una
sesión verificada en servidor, no de la petición, validar origen y retorno y mantener
la vinculación segura con el navegador durante el callback OAuth. El cliente actual
mantiene la sesión Supabase en el navegador, por lo que ese puente aún no existe.
Aislar conexiones con RLS, restringir aún más credenciales, gestionar la clave y
su rotación y no registrar tokens, códigos OAuth ni detalles sensibles.

El código local puede solicitar la revocación a Google, pero todavía no implementa
la desconexión ni limpieza. Revocar un permiso de una cuenta Google puede afectar
a otros vínculos de la misma cuenta con el mismo cliente OAuth; no ejecutarlo
automáticamente sin resolver esa interacción entre empresas.

## Integridad pendiente antes de conectar

- Persistir el vínculo entre conexión, calendario, visita y evento, con una cola
  transaccional y reconciliación periódica para altas, ediciones, cancelaciones,
  reasignaciones y cambios de miembros del equipo. Una operación debe permanecer
  pendiente o en error hasta confirmarse realmente en Google; las respuestas
  inciertas requieren reconciliación, no una falsa confirmación.
- Crear un calendario secundario no es idempotente. Si se pierde la respuesta,
  no repetir automáticamente: con `calendar.app.created` no se dispone del permiso
  para `calendarList.list`. Diseñar recuperación explícita y segura sin solicitar
  permisos adicionales por defecto; el cliente local no resuelve ese caso.
- El ID local es estable por empresa, usuario y visita; cumple el alfabeto de
  Google, pero por sí solo no prueba propiedad ni garantiza ausencia de colisiones.
  Validar el evento remoto y su propiedad antes de actualizar o borrar; contemplar
  conflictos, cancelaciones remotas y eventos eliminados que impidan reutilizar IDs.
- Serializar por conexión y visita, comprobar versión/asignación antes y después
  de cada llamada, usar ETag/`If-Match` cuando corresponda y reconciliar respuestas
  tardías o condiciones de carrera. Una llamada en curso no puede revertirse
  atómicamente con una transacción de Ábaco: manejar y comunicar esa ventana.
- Mantener instantes UTC y zona IANA explícita; verificar cambios de horario de
  verano, visitas que cruzan medianoche y cambios de zona. La proyección local no
  valida la fuente de datos ni resuelve horarios locales ambiguos.
- Tras revocación o desconexión, dejar de escribir, mostrar el estado y gestionar
  la limpieza pendiente. Si el token ya no permite acceder, no prometer el borrado
  remoto: informar de los eventos residuales y permitir reconexión o retirada manual.
- Probar con cuentas y empresas aisladas: OAuth y `state`, RLS, permisos, duplicados,
  404/409/410/412/429, respuestas perdidas, reintentos, revocación, cambios
  concurrentes y equipos, además de una prueba real autorizada de extremo a extremo.

Decisiones de producto pendientes: qué estados terminales se conservan; política
de eliminación al desconectar; horizonte de
sincronización; y cómo avisar de retrasos o eventos residuales. Hace falta también
un entorno de pruebas y autorización explícita para aplicar infraestructura y
probar Google. No se ha escrito en servicios externos ni desplegado nada.

## Referencias de Google

- [Permisos de Calendar](https://developers.google.com/workspace/calendar/api/auth)
- [Creación e IDs de eventos](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- [Permisos para listar calendarios](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list)
- [Versionado y ETag](https://developers.google.com/workspace/calendar/api/guides/version-resources)
- [Buenas prácticas OAuth](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Verificación y políticas OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)
