# Equipos de trabajo

Funcionalidad implementada en Ábaco. Una empresa puede agrupar sus miembros y asignar
esos grupos a trabajos sin depender de un oficio. No sustituye las asignaciones
individuales de visitas.

## Contrato

- `features/work-teams/domain`: modelo, validación de entrada y puerto de persistencia.
- `application`: comandos con dependencias inyectables y claves de consulta por empresa.
- `infrastructure`: adaptador Supabase; sin acceso desde los componentes.
- `ui`: creación, edición, archivo y recuperación en Ajustes → Equipo.
- Los trabajos conservan responsable individual y añaden un equipo opcional. Los trabajos
  contratados también guardan un equipo operativo para sus visitas; esto no asigna
  automáticamente a todos sus miembros.
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
La integración actual también usa los equipos al proponer cobertura manual de visitas
afectadas por vacaciones o bajas aprobadas: limita candidatos al equipo de la visita,
si tiene uno. No comprueba competencias ni asigna a todo el equipo. Véase
[ausencias y cobertura](COBERTURA_DE_VACACIONES.md).

## Estado, validación y despliegue

La migración `20261103090000_work_teams.sql` y su prueba pgTAP están en este repositorio.
Su presencia en Git no demuestra que se haya aplicado en cada entorno. Antes de desplegar
una versión, comprobar el historial de migraciones del proyecto Supabase de destino.

- Vitest cubre normalización, validación, opciones de asignación, filtros de URL y
  contratos del adaptador de trabajos.
- `supabase/tests/database/work_teams.test.sql` cubre aislamiento, permisos, reintentos,
  versiones, archivo, claves compuestas y compatibilidad del comando anterior.
- Para validar cambios futuros, ejecutar `pnpm quality` y `pnpm build`, y la suite pgTAP
  con Supabase local. Para despliegues, comprobar los flujos con cuentas separadas en
  staging antes de aplicar cambios a un entorno con datos reales.
- Si la migración falta en el entorno de destino, validar y aplicar primero la migración;
  el frontend necesita la columna, tablas y comandos. No hay fallback local ni se ocultan
  errores como datos vacíos.

## Límites vigentes

Disponibilidad por integrante, planificación directa de visitas por equipo, partes
colectivos e instantáneas históricas de participantes no forman parte del comportamiento
descrito aquí. La cobertura por vacaciones/bajas es manual y tiene los límites de la
[ficha de ausencias](COBERTURA_DE_VACACIONES.md). No prometer estas capacidades como
automatizadas.
