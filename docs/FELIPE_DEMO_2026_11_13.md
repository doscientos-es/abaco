# Felipe Tavernier Dely — demo de Ábaco

Reunión: viernes **13/11/2026, 9:00–9:30**. Preparación: 10/11/2026.
Actividad: limpieza en Melilla; aproximadamente 159 trabajadores según el encargo.

## Estado y alcance real

**Entrega anterior implementada y migrada al proyecto Supabase existente `abaco-doscientos`
(`vqyicgarlksirpzrngut`), autorizado por el usuario.**
Se han validado 66 aserciones SQL remotas con datos ficticios y `ROLLBACK`;
no quedan usuarios ni empresas de prueba. No se ha reiniciado la base de datos.
Los formularios usan Supabase, no un almacenamiento simulado como sustituto del servidor.
La validación SQL comprueba funciones y permisos reales, pero no sustituye una prueba
interactiva de navegador, recarga de pantalla ni subida/descarga efectiva de archivos.

### Nuevo modelo: presupuesto → contrato → trabajos → órdenes

**Implementado en código y validado con transacciones revertidas; la nueva migración
`20261110150000_estimate_contract_jobs.sql` todavía NO está aplicada permanentemente.**
No desplegar este frontend contra el esquema anterior: necesita esa migración y
`20261110160000_weekly_contract_scheduling.sql`, descrita a continuación.

- Un presupuesto nuevo se convierte automáticamente en contrato en borrador al aceptarse,
  tanto por oficina como mediante el cambio de estado del enlace público existente.
- Cada partida aceptada genera un trabajo independiente, pendiente de configuración.
  No se inventan centros, asignaciones, horarios ni frecuencias acordadas. La fecha inicial
  del contrato es provisional (aceptación); administración confirma vigencia y renovación.
- Se conservan precio neto, descuentos, alcance publicado y procedencia/evidencia de aceptación.
  Los reintentos no duplican contratos, trabajos ni órdenes.
- Cada trabajo permite una sola realización o una recurrencia semanal, semanas alternas,
  15 días o mensual. La hoja fija permanente no genera partes diarios; el móvil genera órdenes.
- Centro obligatorio por trabajo, creable desde el formulario o desde la ficha del cliente.
  Sin modelo de piscinas/activos en la aplicación; se conservan los datos históricos existentes.
- La activación se bloquea en servidor mientras quede alguna partida sin configurar.
- Importe único o precio mensual/trimestral/anual, independiente de la frecuencia operativa.
  El importe único produce una obligación; las interrupciones y periodos anteriores a la
  activación requieren revisión de precio, no se cobran completos silenciosamente.
- `/trabajos` unifica planificación y partes con vistas de lista y calendario sobre los mismos
  registros. Conserva el acceso a las partidas contratadas y su configuración, y a los trabajos
  del modelo anterior, que siguen consultables y se pueden terminar.
- No se convierten retroactivamente presupuestos ni publicaciones existentes. Se conserva
  su conversión anterior; una revisión nueva usa el nuevo modelo.
- Verificación adicional: **39 aserciones SQL remotas sin fallos** (33 de aceptación/trabajos
  y 6 de facturación única). Migración y datos de prueba revertidos; comprobado que no quedan.
  No equivale a una prueba HTTP del enlace público ni a una prueba interactiva del navegador.
- Validación del nuevo código: **364 pruebas en 89 archivos**, tipos, build y estructura
  correctos; lint sin errores y con cinco avisos existentes. El build conserva un aviso
  del generador de rutas sobre `src/routes/root-session.test.ts`.

### Trabajos: lista y calendario en un único módulo

- Una única entrada «Trabajos» en navegación de escritorio y móvil; no hay otra sección Agenda.
- Ambas vistas comparten fecha, periodo (día/semana/mes), persona, equipo, estado y búsqueda.
  Se guardan en la URL y no cambian los registros al alternar entre lista y calendario.
- Reprogramación y consulta de partes disponibles desde ambas vistas. Los enlaces antiguos
  `/agenda` redirigen a `/trabajos`, conservando la vista, las fechas y los filtros existentes.
- Las partidas sin planificar y las hojas fijas permanecen accesibles en «Partidas contratadas y
  configuración»; no se inventan ocurrencias de calendario para ellas.
- Los detalles de trabajos anteriores mantienen su ruta; no se modifican datos ni esquema.
- Validación de la fusión: **386 pruebas en 96 archivos**, tipos, build y estructura correctos;
  lint sin errores y con cinco avisos existentes. Sin despliegue ni prueba interactiva en navegador.

### Calendarios interactivos compartidos

- Trabajos, ausencias y vencimientos comparten vistas de día, semana y mes, navegación de fechas
  y eventos pulsables para abrir detalles. La cuadrícula mensual de trabajos carga también los
  días contiguos visibles, por tramos compatibles con el límite de fechas de la RPC existente.
- Trabajos: horario completo de 00:00 a 24:00, inicio y fin explícitos, distribución de
  solapamientos y continuidad de visitas nocturnas. Arrastrar cambia día/hora conservando el punto
  de agarre; el borde inferior modifica el final. Ajuste de 15 minutos y desplazamiento vertical
  automático en los bordes. Los trabajos cerrados no admiten estos gestos.
- Cada gesto propone un cambio en el formulario de reprogramación: no escribe inmediatamente.
  Se mantienen motivo obligatorio, persona asignada, versión original y operación idempotente.
  La hora se interpreta en la zona del centro, no en la del ordenador.
- Ausencias: bloques de días completos, fin inclusivo y recuentos de personas únicas. Mover
  conserva la duración; redimensionar propone otro fin. Un periodo sin fin se muestra hasta el
  borde de la vista; moverlo conserva el fin abierto y solo un redimensionado propone cerrarlo.
  Administración confirma fechas y motivo antes de guardar con el control de versión existente.
- Vencimientos: pagos pendientes movibles con confirmación en su formulario. No se inventa
  duración para un vencimiento ni se cambian facturas o pagos ya registrados mediante arrastre.
- Alternativa de teclado: Alt + flechas mueve; Alt + Mayús + flechas cambia el final.
  Escape cancela un arrastre. Sin dependencias nuevas ni migración adicional de calendario.
- Pruebas automatizadas de fechas, solapamientos, gestos, permisos, propuestas, persistencia y
  reintentos. No sustituyen una comprobación interactiva de ratón/táctil en navegador ni una
  escritura HTTP real; estas comprobaciones y el despliegue siguen pendientes.
- Validación: **419 pruebas en 103 archivos** correctas; build (incluye tipos), lint y estructura
  correctos. El build mantiene los avisos de rutas de pruebas y tamaño de chunk existentes.

### Contratos con horario visual y generación de toda la vigencia

**Implementado en código; `20261110160000_weekly_contract_scheduling.sql` NO aplicada.**
Depende de `20261110150000_estimate_contract_jobs.sql`; aplicar y validar ambas en orden
antes de desplegar el frontend. Las comprobaciones SQL remotas anteriores no validan
esta nueva migración.

- Inicio y fin obligatorios al confirmar la vigencia, con límite operativo de 3.660 días.
  Los borradores procedentes de presupuestos siguen naciendo sin inventar una fecha de fin.
- Semanales y semanas alternas: dibujar franjas en una semana tipo, moverlas, ampliar el
  borde inferior, añadir turnos partidos y horarios distintos por día. Ajuste de 15 minutos,
  edición manual accesible y copia del lunes a los cinco días laborables.
- Mensuales y cada 15 días: marcar una única franja en la semana real de referencia;
  cambiarla sustituye la franja, no convierte la frecuencia en semanal.
- Se muestra el número previsto de trabajos semanales entre las fechas, incluidas semanas
  parciales. Las franjas nocturnas que terminarían después del fin quedan excluidas.
- Equipo obligatorio para nuevos trabajos móviles periódicos. Activar genera en una sola
  transacción sus órdenes de toda la vigencia y mantiene el equipo elegido, sin limitarse
  al horizonte mensual. Añadir un trabajo a un contrato activo genera desde hoy hasta el fin.
- Identidad independiente por franja: dos turnos del mismo día producen dos órdenes.
  Reintentar no duplica órdenes ni revierte una edición posterior del horario.
- Las hojas fijas conservan su pauta imprimible sin generar partes diarios. Los contratos
  estacionales antiguos conservan su preparación mensual; no se migran sus horarios a ciegas.
- Horas locales inexistentes/ambiguas o fuera de vigencia se registran como incidencias,
  no se fuerzan. Solapamientos, ausencias y equipos archivados producen avisos de revisión;
  no se sustituye ni se redistribuye automáticamente el equipo.
- Cobertura añadida en `weekly_contract_scheduling.test.sql`: turnos partidos, más de
  180 días, fin obligatorio, equipo, zona horaria, reintentos y permisos. **No ejecutada**:
  PostgreSQL local rechaza conexión y las conexiones MCP disponibles deniegan el acceso remoto.
- Validación de aplicación: **445 pruebas en 105 archivos** correctas y `pnpm build`
  correcto, incluido TypeScript. Lint y estructura comprobados por separado; se mantienen
  los avisos de lint, rutas de pruebas y tamaño de chunk existentes.
- `pnpm quality` se detiene en formato global: **84 archivos** señalados. El formato de
  los 16 archivos revisados en este cierre pasa; no se ha reformateado el resto del proyecto.
- Sin prueba interactiva de navegador, despliegue ni aplicación permanente de migraciones.

### Retirada del modelo antiguo de piscinas y activos

- Ficha del cliente centrada en contactos, centros, incidencias e historial de visitas.
- Sin creación, selectores ni paneles de piscinas, activos, equipos instalados o mediciones
  en la ficha, agenda, incidencias y visualización de partes. Se mantienen los equipos de trabajo.
- Eliminados los componentes y consultas del módulo antiguo. Los nuevos comandos envían
  valores nulos a los parámetros heredados de las RPC para mantener compatibilidad con la BD.
- No se borran tablas, relaciones, versiones cerradas ni documentos históricos. La limpieza
  del almacenamiento local del módulo retirado se conserva al cerrar sesión por privacidad.
- Esta retirada no necesita una migración adicional; la del nuevo flujo contractual sigue pendiente.
- Comprobación de esta retirada: **376 pruebas en 94 archivos**; tipos, build y estructura
  correctos. No se ha desplegado el frontend ni se ha validado el recorrido en navegador.

### Base existente conservada

- Autenticación, empresas, roles y aislamiento por empresa mediante RLS.
- Clientes, contactos y centros; presupuestos, trabajos y contratos.
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
- Activación con generación completa del nuevo horario; preparación de un mes conservada
  para recuperación y pautas antiguas, sobre **todos los contratos activos** de la empresa.
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

## Base de datos aplicada

Aplicadas el 10/11/2026 mediante MCP `supabase backup05` al proyecto indicado,
después de comprobar las migraciones anteriores y revisar el SQL:

- `20261110110000_cleaning_services.sql`
- `20261110120000_paper_visit_operations.sql`
- `20261110130000_admin_absence_management.sql`
- `20261110140000_restrict_expense_guard_execution.sql`

Las versiones de estas cuatro entradas del historial remoto se han alineado con
los nombres del repositorio, conservando sus sentencias y sin volver a ejecutarlas.
La última restringe la ejecución directa de una función interna de gastos; el trigger
conserva su protección de modificaciones y borrados, verificada con pruebas.
El bucket `signed-work-sheets` es privado, con límite de 15 MiB y tipos PDF/JPEG/PNG/WebP.
RLS está habilitado en las tablas nuevas y las RPC nuevas no son ejecutables por `anon`.
No se ha confirmado que este proyecto sea un entorno separado de staging:
introducir únicamente datos ficticios en una empresa expresamente autorizada para demo.
No usar `db reset` ni incorporar credenciales a este documento.

## Datos ficticios para introducir en staging

| Entidad      | Ejemplo — no son datos reales ni están precargados                                 |
| ------------ | ---------------------------------------------------------------------------------- |
| Cliente      | Comunidad Alborán DEMO                                                             |
| Centros      | Portal A DEMO y Garaje DEMO; direcciones ficticias en Melilla                      |
| Personal     | Ana DEMO, Bea DEMO; miembros con rol `user`                                        |
| Equipo       | Móvil A DEMO                                                                       |
| Contrato     | Limpieza Alborán DEMO; inicio 01/11/2026; precio cero si aún no hay precio pactado |
| Hoja fija    | Portal A; lunes/miércoles/viernes; 120 min estimados; suelos y escaleras           |
| Cristales    | Portal A; móvil; mensual desde 10/11/2026; 120 min; equipo Móvil A                 |
| Garaje       | Garaje; móvil; cada 15 días desde 12/11/2026; 180 min; colocar carteles            |
| Ausencias    | Ana: vacaciones aprobadas 16–20/11; asuntos propios pendientes el 18/11            |
| Coincidencia | Bea: vacaciones aprobadas 19–23/11                                                 |

El personal se selecciona de los miembros existentes de la empresa; no se ha creado
una plantilla independiente sin cuenta ni una importación de los 159 trabajadores.
Administración puede operar en su nombre; no exige que usen la aplicación o móvil personal.

## Guion de prueba: servicios y papel

1. Entrar como administración. En `/clientes`, crear el cliente y sus dos centros;
   guardar acceso/contacto, recargar y comprobar que se conservan.
2. Tras aplicar las dos migraciones pendientes, crear un presupuesto con tres partidas y aceptarlo.
   Abrir el borrador; confirmar inicio y fin obligatorio. Dibujar dos franjas el lunes,
   mover y redimensionar una; probar la copia a laborables y elegir equipo móvil.
   Configurar los tres trabajos. Antes de configurarlos todos, comprobar que no permite activarlo.
   Imprimir la hoja fija: comprobar cliente, centro, tareas por día y ausencia de precios.
3. Activar contrato: deben aparecer órdenes hasta su fin, no solo en noviembre.
   Preparar noviembre y repetir: debe crear **cero** visitas adicionales.
   La hoja fija no debe producir visitas; garaje debe aparecer los días 12 y 27.
4. En `/trabajos`, comprobar lista/calendario, mes/semana/día, filtros y pendientes de asignar.
   Alternar de vista: deben mantenerse fechas, filtros y registros. Abrir un enlace antiguo
   `/agenda` y comprobar la redirección. Cambiar equipo/orden de una visita y recargar.
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

- Comprobaciones de la entrega anterior, ejecutadas el 10/11/2026:
  - `pnpm test`: **335 pruebas correctas en 84 archivos**.
  - `pnpm build`: correcto, incluyendo `pnpm typecheck`.
  - `pnpm lint`: correcto, con 5 avisos y 0 errores.
  - `pnpm structure:check`: correcto.
  - Formato comprobado en los archivos de este cierre; la comprobación global
    `pnpm format:check` no está limpia. No se ha reformateado todo el proyecto.
- Pruebas SQL remotas ejecutadas mediante MCP, recopilando resultados pgTAP
  dentro de transacciones revertidas: **66 aserciones, 0 fallos**.
  - `cleaning_services.test.sql`: 23; recurrencias, generación idempotente,
    hoja fija sin ocurrencias, snapshot y registro administrativo de realización.
  - `admin_absence_management.test.sql`: 17; registro, cancelación, historial,
    versiones obsoletas, reintentos y aislamiento entre personas/empresas.
  - `paper_visit_operations.test.sql`: 22; cancelación con motivo, reintentos,
    estados cerrados y permisos de documentos/metadatos de Storage.
  - `expense_guard_permissions.test.sql`: 4; ejecución directa denegada y
    protección del trigger conservada para modificaciones y borrados.
- `supabase test db` está bloqueado: PostgreSQL local rechaza conexión en 127.0.0.1:60322;
  el entorno local de Supabase/Docker no está arrancado. No se ha ejecutado la suite SQL
  completa local: los resultados anteriores corresponden a las comprobaciones remotas.
- Las pruebas de Storage insertan únicamente metadatos transaccionales: no suben archivos.
- Pendientes de validación: guardar/recargar desde la interfaz, sesiones concurrentes reales,
  subida y descarga HTTP de adjuntos, impresión física/PDF y generador programado.
- No se ha realizado una prueba interactiva de navegador ni un despliegue del frontend.
- Avisos de plataforma pendientes: extensión `pg_net` en `public`
  ([guía](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public))
  y protección de contraseñas filtradas desactivada
  ([guía](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).
  No se ha cambiado la configuración de Auth ni trasladado extensiones.
- El asesor también enumera RPC autenticadas `SECURITY DEFINER` y tablas internas
  con RLS sin políticas: no implica por sí solo exposición. No se han eliminado sus
  controles ni declarado auditadas todas las RPC existentes.

## Pendientes funcionales

- Revisar cómo se modifica una pauta completa a futuro: ahora se añaden servicios y
  se reprograman/cancelan ocurrencias, pero no hay editor versionado de una serie existente.
- No hay plantilla independiente sin cuenta, modelo de jornadas parciales, fijos discontinuos
  ni calendarios escolares. Las notas no sustituyen un modelo laboral ni calculan consumo legal.
- Equipos son una asignación operativa: no se garantiza disponibilidad de cada integrante,
  desplazamientos, optimización de rutas ni cobertura automática.
- La disponibilidad existente bloquea vacaciones/bajas aprobadas al asignar una persona;
  no prometer idéntico bloqueo de asuntos propios hasta unificar y validar esa regla.
- No hay fichaje ni obligación de teléfono personal. La firma es papel adjunto, no firma
  electrónica certificada. La impresión no acredita realización ni conformidad.
- Los snapshots e historial nuevos empiezan con esta migración; no reconstruyen el pasado.

## Decisiones a confirmar con Felipe

- Qué entiende por quincenal: semanas alternas, 15 días o dos fechas del mes.
- Tratamiento de días no laborables, festivos, meses cortos y fin/renovación del contrato.
- Origen de los datos de plantilla y altas sin cuenta; jornadas parciales, fijos discontinuos
  y calendarios escolares que deban representarse expresamente.
- Quién aprueba, cupos, saldos, delegaciones y conservación de documentos.
- Campos y destinatarios del papel, necesidad de conformidad y circuitos de devolución.
- Reglas de cobertura y disponibilidad de equipos antes de automatizar asignaciones.
- Requisitos laborales, privacidad y conservación aplicables, sin asumirlos como acordados.
