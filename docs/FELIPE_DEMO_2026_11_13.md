# Felipe Tavernier Dely — demo de Ábaco

Reunión: viernes **13/11/2026, 9:00–9:30**. Preparación: 10/11/2026.
Actividad: limpieza en Melilla; aproximadamente 159 trabajadores según el encargo.

## Estado y alcance real

**Implementado en código, pendiente de validación contra una base de datos de pruebas.**
No se han aplicado migraciones remotas ni creado datos en ninguna empresa real.
Los formularios usan Supabase, no un almacenamiento simulado como sustituto del servidor.
Las pruebas con dobles de Supabase verifican contratos del código, no persistencia real ni RLS.

### Base existente conservada

- Autenticación, empresas, roles y aislamiento por empresa mediante RLS.
- Clientes, contactos, centros e instalaciones; presupuestos, trabajos y contratos.
- Agenda, reprogramación con control de versión, eventos de visita e informes técnicos.
- Solicitudes de ausencia, petición de información, decisiones y revisión manual de cobertura.
- Facturación y contabilidad existentes: no se han sustituido ni presentado como nuevas.

### Ampliaciones de esta entrega

- Centros: contacto operativo, acceso, observaciones y estado activo/inactivo.
- Servicios independientes dentro de un contrato, cada uno con centro, vigencia, tareas,
  modalidad, duración estimada, hora opcional y persona/equipo habitual.
- Hoja fija: pauta semanal y tareas por día; imprimible, sin generar visitas diarias.
- Servicio móvil: recurrencia semanal, semanas alternas, cada 15 días o mensual.
  Semanas alternas usa semanas de lunes a domingo desde la semana de referencia.
  Mensual usa el último día disponible sin perder el día original en meses posteriores.
- Preparación de un mes desde contratos; opera sobre **todos los contratos activos** de la empresa.
- Agenda por día/semana/mes; filtros por persona, equipo, estado y cliente/centro;
  agrupación por salida, orden manual y suma de minutos estimados, no horas realizadas.
- Partes individuales y salida diaria por lotes, mediante impresión/guardar como PDF.
  Datos operativos originales capturados al generar; no incluyen precios ni datos laborales.
- Registro administrativo de realización con fecha real, notas o cancelación con motivo.
- Justificantes PDF/fotos en bucket privado; descarga temporal; historial de cambios por visita.
- Historial desde cliente, filtrable por centro, con acceso al mismo parte y sus justificantes.
- Administración registra, modifica y cancela ausencias sin intervención del trabajador.
  Fechas inclusivas, fin desconocido, notas, solapamientos y estados diferenciados.
- Calendario de ausencias y quincenas; personas únicas aprobadas/pendientes, sin contar
  dos veces a una persona por tener varios periodos en el mismo grupo.
- Historial de ausencias con antes/después, autor y fecha; concurrencia y claves de reintento.
  No se permite transferir un periodo a otro empleado: cancelar y registrar uno nuevo.

## Requisito antes de probar datos reales

Se necesita identificar y autorizar un proyecto Supabase **de staging**.
Aplicar allí las migraciones pendientes, en orden, tras revisar su estado:

- `20261110110000_cleaning_services.sql`
- `20261110120000_paper_visit_operations.sql`
- `20261110130000_admin_absence_management.sql`

Son extensiones del esquema existente; necesitan todas sus migraciones anteriores.
No conectar esta versión del frontend a una base sin dichas columnas/RPC.
No usar `db reset` en producción. No incorporar credenciales a este documento.

## Datos ficticios para introducir en staging

| Entidad | Ejemplo — no son datos reales ni están precargados |
| --- | --- |
| Cliente | Comunidad Alborán DEMO |
| Centros | Portal A DEMO y Garaje DEMO; direcciones ficticias en Melilla |
| Personal | Ana DEMO, Bea DEMO; miembros con rol `user` |
| Equipo | Móvil A DEMO |
| Contrato | Limpieza Alborán DEMO; inicio 01/11/2026; precio cero si aún no hay precio pactado |
| Hoja fija | Portal A; lunes/miércoles/viernes; 120 min estimados; suelos y escaleras |
| Cristales | Portal A; móvil; mensual desde 10/11/2026; 120 min; equipo Móvil A |
| Garaje | Garaje; móvil; cada 15 días desde 12/11/2026; 180 min; colocar carteles |
| Ausencias | Ana: vacaciones aprobadas 16–20/11; asuntos propios pendientes el 18/11 |
| Coincidencia | Bea: vacaciones aprobadas 19–23/11 |

El personal se selecciona de los miembros existentes de la empresa; no se ha creado
una plantilla independiente sin cuenta ni una importación de los 159 trabajadores.
Administración puede operar en su nombre; no exige que usen la aplicación o móvil personal.

## Guion de prueba: servicios y papel

1. Entrar como administración. En `/clientes`, crear el cliente y sus dos centros;
   guardar acceso/contacto, recargar y comprobar que se conservan.
2. En `/contratos`, crear el contrato y añadir las tres pautas indicadas.
   Imprimir la hoja fija: comprobar cliente, centro, tareas por día y ausencia de precios.
3. Activar contrato y preparar noviembre. Repetir: debe crear **cero** visitas adicionales.
   La hoja fija no debe producir visitas; garaje debe aparecer los días 12 y 27.
4. En `/agenda`, comprobar mes/semana/día, filtros y pendientes de asignar.
   Cambiar equipo/orden de una visita y recargar.
5. Reprogramar una ocurrencia, indicar motivo y recargar. Su referencia original y
   siguientes fechas deben permanecer intactas; volver a generar no debe duplicarla.
6. Imprimir parte individual y lote diario. Revisar A4, saltos de página, instrucciones,
   hueco para incidencias y conformidad solo cuando corresponda. Guardar PDF local.
7. Registrar realizada con fecha real distinta de la prevista, adjuntar un PDF/foto
   ficticio y recargar. Ver estado, fecha, historial y documento desde el cliente/centro.
8. Cancelar otra ocurrencia con motivo. No debe confundirse con servicio prestado
   ni regenerarse al repetir la generación.
9. Ensayo adicional: contrato enero–marzo de 2027, mensual desde 31/01:
   fechas esperadas 31/01, 28/02, 31/03; no 28/03.

## Guion de prueba: ausencias administrativas

1. En `/vacaciones`, registrar las tres ausencias ficticias y recargar.
2. Ver el 18/11: Ana cuenta una vez en aprobadas y una en pendientes; no son dos empleados.
   El 19/11 coinciden dos personas aprobadas: Ana y Bea.
3. Ver 16–23/11: dos personas únicas aprobadas en el intervalo, no necesariamente
   coincidentes todos sus días. Revisar nombres, tipos y fechas en la lista.
4. Añadir otro periodo de Ana que se solape: debe advertir, sin inventar cupos o saldos.
5. Modificar fechas/notas, cancelar el periodo pendiente y revisar antes/después.
   Cancelado y rechazado no cuentan como ausencia aprobada ni pendiente.
6. Abrir el mismo periodo en dos sesiones de administración: la segunda edición obsoleta
   debe fallar con aviso, no sobrescribir la primera. Cerrar, recargar y reabrir para editar.
7. Probar empleado ajeno y otra empresa: no deben poder gestionar ausencias ni leer
   historial/documentos de terceros. Probar también usuario no autenticado.

## Validación técnica

- Ejecutar `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm structure:check` y `pnpm build`.
- Pruebas SQL nuevas: `cleaning_services.test.sql` y `admin_absence_management.test.sql`.
- `supabase test db` está bloqueado: PostgreSQL local rechaza conexión en 127.0.0.1:60322;
  el entorno local de Supabase/Docker no está arrancado. SQL/RLS aún **no validados**.
- Pendientes en entorno real: guardar/recargar, permisos, concurrencia, almacenamiento,
  descarga de adjuntos, impresión física/PDF y ejecución programada del generador.
- No se ha realizado una prueba interactiva de navegador ni un despliegue.

## Pendientes funcionales y decisiones con Felipe

- Revisar cómo se modifica una pauta completa a futuro: ahora se añaden servicios y
  se reprograman/cancelan ocurrencias, pero no hay editor versionado de una serie existente.
- Confirmar qué entiende por quincenal: semanas alternas, 15 días o dos fechas del mes.
- Confirmar días no laborables, festivos, meses cortos y reglas de fin/renovación del contrato.
- Validar datos de plantilla, altas sin cuenta, jornadas parciales, fijos discontinuos y calendarios
  escolares. Las notas no sustituyen un modelo laboral ni calculan consumo legal.
- Confirmar quién aprueba, cupos, saldos, delegaciones y conservación de documentos.
- Equipos son una asignación operativa: no se garantiza disponibilidad de cada integrante,
  desplazamientos, optimización de rutas ni cobertura automática.
- La disponibilidad existente bloquea vacaciones/bajas aprobadas al asignar una persona;
  no prometer idéntico bloqueo de asuntos propios hasta unificar y validar esa regla.
- No hay fichaje ni obligación de teléfono personal. La firma es papel adjunto, no firma
  electrónica certificada. La impresión no acredita realización ni conformidad.
- Los snapshots e historial nuevos empiezan con esta migración; no reconstruyen el pasado.