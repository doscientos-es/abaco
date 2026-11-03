# Equipos de trabajo

Primera ampliación horizontal de la operativa de Ábaco. Una empresa puede agrupar
sus cuentas existentes y asignar esos grupos a trabajos sin depender de un oficio.
No sustituye las asignaciones individuales de visitas.

## Contrato

- `features/work-teams/domain`: modelo, validación de entrada y puerto de persistencia.
- `application`: comandos con dependencias inyectables y claves de consulta por empresa.
- `infrastructure`: adaptador Supabase; sin acceso desde los componentes.
- `ui`: creación, edición, archivo y recuperación en Ajustes → Equipo.
- Los trabajos conservan responsable individual y añaden un equipo opcional.
- Los filtros de trabajos se ejecutan en el servidor antes de paginar y contar;
  equipo, estado y página pertenecen a la URL.

La agrupación es **actual**, no una instantánea de los participantes de cada jornada.
No usar su composición para calcular costes históricos ni asistencia.

## Persistencia y permisos

La migración `20261103090000_work_teams.sql` añade equipos, miembros y operaciones
de guardado, y una referencia multiempresa desde los trabajos.

- Propietario/administrador gestionan grupos mediante `save_work_team`.
- Propietario/administrador/editor planifican mediante `plan_work_order`.
- Solo lectura puede consultar los equipos para interpretar los trabajos.
- Técnico no obtiene acceso a equipos de oficina ni a trabajos por pertenecer a ellos.
- No se permite escritura directa en las tablas desde la sesión del cliente.
- RLS y claves foráneas compuestas impiden cruces entre empresas.
- Cada guardado verifica la versión y conserva una clave de operación para reintentos.
- La eliminación de una cuenta retira sus vínculos y cambia la versión de sus equipos.
- Los nombres activos son únicos por empresa, ignorando mayúsculas y espacios externos.
- Un equipo vacío o archivado no admite nuevas asignaciones; los trabajos existentes
  pueden conservarlo o quitarlo sin perder su historial.

La planificación completa usa una transacción y el historial inmutable de trabajos.
La función anterior `update_work_order_plan` delega en el mismo comando, preserva
el equipo y admite reintentos anteriores: no hay dos implementaciones de las reglas.
No se crean visitas ni se modifican roles, precios o límites de suscripción.

## Validación y activación

- Vitest cubre normalización, validación, opciones de asignación, filtros de URL y
  contratos del adaptador de trabajos.
- `supabase/tests/database/work_teams.test.sql` cubre aislamiento, permisos, reintentos,
  versiones, archivo, claves compuestas y compatibilidad del comando anterior.
- Ejecutar `pnpm quality` y `pnpm build` para la aplicación.
- Ejecutar la suite pgTAP con Supabase local y probar los flujos con cuentas separadas
  en staging antes de aplicar la migración a un entorno con datos reales.
- Desplegar la migración validada antes que el frontend: este necesita la nueva columna,
  tablas y comandos. No hay un fallback local ni se ocultan errores como datos vacíos.

Pendiente: disponibilidad y ausencias, planificación de visitas por equipo, partes
colectivos e instantáneas históricas de los participantes. No anunciarlos como disponibles.
