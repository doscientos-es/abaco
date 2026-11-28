# Etiqueta QR de equipo · DEV-73

- Oficina: **Clientes → Centro de servicio → Etiquetas QR**. Lista equipos instalados activos existentes. Permite crear, imprimir, volver a imprimir, copiar, sustituir o retirar una etiqueta. No añade altas de equipos ni reasigna visitas. Sustituir o retirar invalida el código anterior; se pide confirmación.
- Escaneo: abre una ruta privada con un identificador aleatorio en el fragmento de la URL. No contiene nombre, dirección, cliente, número de serie ni identificadores de empresa, centro o visita. El retorno de contraseña y Google mantiene el fragmento local; se abre solo en la empresa activa elegida por quien escanea. El QR no concede permisos.
- Lectura: una persona técnica necesita una visita abierta asignada (directa o por su equipo actual) del activo y centro exactos del equipo. Solo ve tipo/marca/modelo y hasta diez estados/fechas de incidencias asociadas a sus visitas abiertas elegibles del equipo. La oficina, con permisos existentes, ve fechas/estados de ciclo de vida, nunca JSON, anotaciones privadas, títulos, costes, contactos o historial ajeno. Si la etiqueta o los permisos dejan de ser válidos, el mensaje es genérico y sin datos del equipo.
- Impresión: el código se genera localmente con [uqr](https://github.com/unjs/uqr), MIT, versión fijada 0.1.3, con tipos propios y sin dependencias de ejecución. El encoder se carga solo en el diálogo de oficina, no en el lector ni al iniciar sesión. La impresión contiene una tarjeta independiente con QR y un rótulo genérico; no hay servicio externo, analítica de escaneo ni uso offline del contenido consultado.

## Alcance pendiente

En el entorno actual aún no hay equipos instalados registrados. Este corte no convierte los activos genéricos en equipos ni permite registrar equipos desde el diálogo. La funcionalidad se valida con datos sintéticos y queda pendiente de un alta explícita de oficina antes de probar con datos reales.
