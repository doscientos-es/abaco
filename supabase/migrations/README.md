# Migraciones

Añade una migración pequeña y versionada sólo cuando el modelo de datos, el
tenant y las políticas RLS estén aprobados. No guardes dumps, datos reales ni
secretos en esta carpeta.

## Historial aplicado

El proyecto remoto de Ábaco es `abaco-doscientos` (`vqyicgarlksirpzrngut`).
Los prefijos de los archivos identifican las versiones registradas en
`supabase_migrations.schema_migrations`; no son fechas que deban corregirse
manualmente.

El 12 de noviembre de 2026 se verificaron las 93 versiones locales contra el
historial remoto. La sincronización conserva el SQL de 87 migraciones con el
nombre de versión realmente aplicado e incorpora dos correcciones ya aplicadas:

- `20261111214831_fix_visit_start_event_parameters.sql`: corrige los parámetros
  usados al registrar el cambio de estado de una visita.
- `20261112080341_remove_vacation_notification_cron.sql`: retira el cron de
  notificaciones de ausencias y su función auxiliar.

Estos archivos forman parte del historial, no son migraciones pendientes ni
copias que puedan eliminarse. No vuelvas a ejecutar su SQL en el proyecto remoto.

## Nuevos cambios

1. Crea una migración nueva con `supabase migration new <nombre>`; no edites ni
   renombres versiones ya aplicadas para introducir cambios de esquema.
2. Aplica el cambio mediante el MCP `supabase-05`, como indica `AGENTS.md`.
3. Consulta la versión registrada por Supabase y usa ese mismo prefijo en el
   archivo local antes de hacer commit; el MCP puede asignar otra marca de tiempo.
4. Comprueba que no falten versiones en ninguno de los dos historiales. Una
   discrepancia de nombres no se arregla ejecutando de nuevo todas las migraciones
   ni marcándolas como aplicadas sin verificar el esquema.
5. Valida la reconstrucción y las pruebas SQL en una base local desechable según
   el README principal. Nunca uses un reset remoto para sincronizar el historial.
