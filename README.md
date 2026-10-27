# Ábaco

Presupuestos y cobros para autónomos y pequeñas empresas de instalaciones.
Un producto de Doscientos construido con React, Vite, TanStack Router y Supabase.

## Enfoque del producto

Prepara presupuestos, facilita la respuesta de tu cliente y controla lo pendiente
de cobrar. El primer resultado útil de la prueba es enviar un presupuesto real,
no completar una configuración extensa.

- Clientes y catálogo de materiales y mano de obra.
- Presupuestos y facturas; envío por WhatsApp y correo.
- Aceptación o rechazo desde el enlace del cliente, con nombre y fecha registrados.
- Seguimiento de facturas y cobros pendientes; contabilidad básica.

El [plan comercial](docs/COMMERCIAL_PLAN.md) define el cliente inicial, los límites
de la oferta, los escenarios económicos y el piloto de captación y retención.
Las cifras de mercado y los tickets previstos son hipótesis, no resultados medidos.

## Oferta vigente

Todos los planes incluyen las mismas funciones; solo cambia el tamaño del equipo,
incluido el propietario. Precios sin IVA:

| Plan     | Personas | Mensual | Anual |
| -------- | -------: | ------: | ----: |
| Autónomo |        1 |    20 € | 200 € |
| Equipo   |  Hasta 5 |    34 € | 340 € |
| Empresa  | Hasta 15 |    54 € | 540 € |

Prueba de 14 días, hasta 15 personas, sin tarjeta ni cobro automático al terminar.
El pago anual se cobra de una vez. El catálogo se define en
`src/features/billing/domain/plans.ts`; precios y límites deben mantenerse alineados
con la base de datos. Redsys tramita el cobro de la suscripción de Ábaco.

## Alcance

Consulta la [guía de uso de la aplicación](./GUIA_DE_USO.md) para los pasos de oficina y técnico en el estado actual del repositorio.

Ábaco es una aplicación multiempresa para presupuestos, clientes, facturas y cobros de empresas de servicios, con operación de campo (trabajos, visitas, contratos e informes) en desarrollo. Las capacidades aún no implementadas no deben anunciarse como disponibles.

## Estado actual

La aplicación incluye acceso e invitaciones, selección de empresa, clientes, catálogo, presupuestos, aceptación por enlace, facturas por hitos, cobros manuales, libro de ingresos y gastos, correo y suscripción SaaS mediante Redsys. Las nuevas migraciones de integridad conservan instantáneas inmutables de facturas emitidas y presupuestos publicados, preparan un borrador del primer hito al recibir una aceptación pública, sin emitir ni numerar la factura y registran cobros de factura en una transacción con clave de operación. Email, WhatsApp y copia del enlace publican la misma versión; los presupuestos anteriores se identifican como reconstruidos durante la migración. La oficina puede registrar una aceptación manual con referencia a la evidencia conservada, diferenciada de una respuesta directa del cliente. La ampliación del pasaporte de cliente añade contactos, varias ubicaciones, piscinas con dimensiones, tratamiento y temporada, y equipos instalados. Los cambios de activos y equipos dejan historial; la sustitución y edición de piscinas son atómicas, y los costes internos tienen permisos separados. Los clientes se archivan sin perder sus referencias y el formulario señala posibles duplicados para revisión humana. Antes de publicar un presupuesto se elige si dará lugar a un trabajo o a un contrato recurrente, con periodicidad de precio en este último caso. Tras la aceptación, la oficina puede convertirlo manualmente una sola vez al destino publicado. La base de datos conserva la versión aceptada y evita que se creen ambos destinos para la misma propuesta. Su activación requiere aplicar y probar las migraciones en el entorno correspondiente.

Todavía faltan la cronología unificada, los documentos y el acceso protegido de instalaciones, las garantías y las capacidades completas de ubicaciones, piscinas y equipos. Los trabajos se pueden crear de forma independiente o desde un presupuesto aceptado, asignar a una persona del equipo, planificar por fechas y avanzar de estado. Su ficha permite añadir fases, tareas y comprobaciones; el cierre exige terminar o descartar las tareas abiertas. Propietario y administrador pueden registrar costes reales por categoría y tarifa histórica, con anulaciones trazables y sin exponer importes al editor. La ficha del trabajo muestra venta aprobada, facturación sin IVA, cobros con IVA y margen provisional sobre los costes registrados; señala los costes incompletos y los gastos aún no imputados. También pueden proponer extras con precio y coste históricos, y registrar su aprobación o rechazo manual con descripción de la evidencia; esta anotación no equivale a la firma directa del cliente. Un extra aprobado puede convertirse una sola vez en borrador revisable; la emisión posterior conserva el importe, el IVA y el origen aceptado. La base de datos impide preparar extras pendientes o rechazados y evita facturarlos dos veces. Los hitos aceptados pueden prepararse como borradores con concepto y vencimiento editables; propietario o administrador los emiten después de revisarlos, con numeración del servidor. Los extras aprobados también requieren borrador editable antes de emitir. La factura emitida conserva su estado documental; el envío aceptado por Resend deja un evento y el saldo se deriva de los cobros. Contabilidad ofrece CSV separados de clientes, facturas, cobros y gastos para propietario y administrador, con lectura paginada de los registros autorizados. Falta el acceso limitado del asesor, el marcado de periodos exportados o revisados, borradores de otros orígenes, líneas combinadas, parciales y rectificativas. Faltan asimismo archivos y varias capacidades de ejecución. Se han añadido el rol técnico con acceso acotado, la planificación de visitas puntuales con detección de solapamientos, la reprogramación con motivo e historial y una jornada móvil que permite iniciarlas y completarlas. El técnico y la oficina pueden guardar notas y comprobaciones del parte en revisiones con historial; el borrador local se recupera tras recarga, está separado por usuario y empresa, y un conflicto muestra las dos versiones para revisión antes de escribir. Las migraciones anteriores de trabajo y visitas pasaron pgTAP en la base local. Las migraciones recientes de informes y facturación aún requieren ejecución de pgTAP y validación en staging antes del despliegue. Los contratos manuales pueden guardar precio, vigencia, alcance y reglas semanales por meses de temporada. Un generador diario crea visitas recurrentes con unicidad por ocurrencia y registra los conflictos; la pausa y reanudación conservan el historial. La conversión a contrato copia el alcance, la base imponible por periodo y la periodicidad de la propuesta aceptada; la oficina selecciona ubicación y fecha de inicio. Propietario y administrador pueden registrar costes reales del contrato, asociados opcionalmente a una visita, con tarifa histórica, anulación trazable y suma protegida; la ficha advierte que el margen sigue sin poder calcularse hasta completar facturación e imputaciones. Una tarea diaria idempotente genera periodos contractuales completos y borradores valorados, registra fallos por contrato y nunca emite ni envía facturas automáticamente. El precio y el IVA quedan conservados; las cuotas parciales o afectadas por pausas quedan sin importe hasta revisión de oficina. La oficina puede valorar una cuota parcial o afectada por una pausa, preparar un borrador revisable y emitir su factura con origen único y numeración del servidor. La ficha separa facturación, cobros y costes reales para un margen provisional. Contabilidad permite repartir cada gasto entre trabajos o contratos, vincularlo a un coste operativo ya registrado para no contarlo dos veces y anular cada imputación con historial. El gasto imputado suma al margen sin IVA y no puede superar el total bruto registrado. Siguen pendientes ajustes de precio posteriores, rectificativas y automatización de cuotas con reglas comerciales completas. Siguen pendientes la revisión de frecuencias activas, renovación, cuotas, partes, stock, portal y conectores avanzados. La conversión automática y las reglas de señal/plan siguen pendientes. El plan distingue las capacidades entregadas de las previstas.

Las piscinas disponen de parámetros de pH, desinfectante y temperatura, además de parámetros adicionales con unidad y rango configurables. Cada lectura queda vinculada a visita, piscina, método, equipo y hora; conserva el rango vigente, muestra su evaluación en texto y admite correcciones trazables. La ficha de piscina muestra lecturas y cambios de configuración. Las lecturas pendientes se conservan en el dispositivo por usuario, empresa y visita con una clave de operación estable para reintentos; la jornada impide completar una visita mientras haya mediciones pendientes.

El parte también registra tiempo, desplazamientos, materiales, repuestos, productos, acciones correctoras, recomendaciones y siguientes actuaciones. Cada actividad conserva cantidad, unidad, hora, autor y origen de trabajo o contrato; las correcciones no borran el original. Los historiales de lecturas y actividades se consultan por páginas. Los envíos pendientes se pueden reintentar o descartar de forma explícita antes de completar la visita. Las fotos JPEG, PNG y WebP se preparan en IndexedDB, separadas por usuario, empresa y visita; se envían a un bucket privado con acceso acotado y se registran con una operación idempotente. La jornada impide cerrar una visita con fotos pendientes en ese dispositivo. Al completarla, la base conserva una versión inmutable del parte con notas, comprobaciones, tareas, mediciones, actividades, incidencias y referencias a las fotos registradas; la oficina y el técnico asignado pueden consultarla. El mismo cierre crea un trabajo duradero para generar el PDF de la versión, con reintentos y estado visible en la oficina. Propietario o administrador pueden crear un enlace al informe cerrado con token de 256 bits, caducidad de siete días y revocación, copiarlo o compartirlo manualmente por WhatsApp. La vista pública expone una selección de campos sin costes internos y usa URL temporales para fotos privadas. Desde esa vista se puede descargar el PDF conservado en un bucket privado; si el trabajador aún no terminó, la primera descarga también puede generarlo de forma idempotente. La descarga usa una URL temporal. Las funciones Python de Vercel requieren `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` como secretos de servidor. La oficina puede registrar una entrega por correo al email del cliente o de su contacto principal; la cola cifra el enlace, conserva los intentos y reintenta fallos temporales con idempotencia del proveedor durante su ventana de 24 horas. La aceptación del envío y los resultados posteriores de entrega, retraso, rebote y reclamación se muestran por separado mediante eventos firmados de Resend. Los importes de coste siguen reservados a la oficina y aún no se derivan automáticamente de estas cantidades. Faltan alertas automáticas, gráficos de evolución y firma.

Las incidencias se pueden abrir desde una visita asignada o desde el pasaporte del cliente. Conservan ubicación, activo y equipo cuando proceda, prioridad, responsable, plazo, evaluación de cobertura, diagnóstico, resolución e historial de cambios. La oficina decide cobertura y asignación; el técnico asignado puede diagnosticar y resolver. Las incidencias creadas en campo admiten reintentos con una clave estable. La oficina puede convertir cada incidencia una vez por destino a presupuesto borrador, trabajo o visita; cada destino conserva el vínculo con la incidencia y los reintentos no lo duplican. Al cerrar una visita se crea un pendiente de revisión de facturación, clasificado por contrato, trabajo o visita puntual. Propietario o administrador pueden marcarla como incluida o para facturar aparte con motivo e historial; esto no emite ninguna factura. Aún faltan la generación de borradores desde estos pendientes y la entrada de incidencias desde el futuro portal de cliente.

## Desarrollo local

Requisitos: Node.js 22.18 o posterior, pnpm 9.15.2 y, para las pruebas de base de datos, Docker y Supabase CLI 2.116.0.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local` con un proyecto autorizado. Son valores públicos; la seguridad de los datos depende de las políticas RLS y los permisos del backend. No pongas una clave `service_role`, secretos de Redsys o Resend ni credenciales de otras integraciones en variables `VITE_*`. No hay modo de datos ficticios que sustituya a Supabase.

Para el correo del parte, configura en los secretos de Supabase Edge `REPORT_DELIVERY_KEY` (32 bytes codificados en Base64), `RESEND_API_KEY`, `RESEND_FROM`, `APP_URL` y `CRON_SECRET`. En Supabase Vault configura `cron_secret` con el mismo valor y `visit_report_email_worker_url` con la URL HTTPS completa de la función `visit-report-email-worker` de ese entorno. Conserva `REPORT_DELIVERY_KEY` mientras haya entregas pendientes; cambiarla impide descifrar sus enlaces. La cola detiene reintentos automáticos tras 23 horas y marca el resultado como incierto para evitar un segundo envío fuera de la ventana de idempotencia de Resend.

Para conciliar la entrega final, configura en Supabase Edge `RESEND_WEBHOOK_SECRET` (`whsec_...`) y registra en Resend la URL HTTPS `/functions/v1/visit-report-email-events` del proyecto para los eventos `email.delivery_delayed`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed` y `email.suppressed`. El endpoint valida la firma y conserva solo el identificador del correo, destinatario, tipo y fecha del evento; no guarda el contenido del mensaje. Comprueba con un envío de prueba que Resend alcanza este endpoint antes de considerar disponible la conciliación en producción.

Para generar el PDF al cierre, configura además `CRON_SECRET` en Vercel con el mismo valor de Vault `cron_secret` y `visit_report_pdf_worker_url` en Vault con la URL HTTPS de producción `/api/visit_report_pdf_worker`. La base invoca ese trabajador cada minuto; el trabajo permanece pendiente y se reintenta si hay un fallo temporal. Tras ocho intentos fallidos, propietario o administrador pueden revisar el origen o la configuración y solicitar otro intento desde el parte.

## Organización

| Carpeta                   | Responsabilidad                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/app`                 | Router, consultas compartidas y marco de la aplicación.                                                |
| `src/routes`              | Rutas y comprobaciones de acceso. `routeTree.gen.ts` se genera automáticamente.                        |
| `src/features`            | Pantallas y casos de uso por funcionalidad.                                                            |
| `src/shared/domain`       | Tipos y cálculos sin dependencia del proveedor de datos.                                               |
| `src/shared/store`        | Estado heredado y adaptador de Supabase. Se sustituirá gradualmente por comandos y consultas acotadas. |
| `supabase/migrations`     | Esquema, restricciones, funciones transaccionales y RLS.                                               |
| `supabase/functions`      | Funciones Edge para enlaces públicos, correos, invitaciones y facturación SaaS.                        |
| `supabase/tests/database` | Pruebas SQL con pgTAP.                                                                                 |

La interfaz usa React 19, TanStack Router y Query, Tailwind 4 y TypeScript 7. La URL pertenece a TanStack Router, la caché remota a TanStack Query y las primitivas visuales a `@doscientos/ui`. Mantener los permisos y límites de cada feature; no conectar operaciones privilegiadas directamente desde componentes.

## Base de datos y pruebas

Crea migraciones con `supabase migration new <nombre>`. Para reconstruir una base local desde cero y probarlas:

```bash
supabase db start
supabase db reset --local
supabase test db
```

La prueba SQL requiere que el servicio Docker esté activo. CI ejecuta el mismo reinicio y las pruebas de base de datos antes de la versión automática. Las funciones Edge y la aplicación tienen que desplegarse después de sus migraciones compatibles. Antes de aplicar cambios a un proyecto con datos, compara su esquema y migraciones reales con Git, verifica copias de seguridad y restauración en staging y prueba los documentos y contratos existentes. No ejecutes `db reset` en producción.

La comprobación local de la aplicación es:

El contrato completo es `pnpm quality`, también para agentes y CI. No eliminar
checks para ocultar incompatibilidades ni aplicar cambios a datos reales para validar copy.

- `pnpm format:check`: formato compartido.
- `pnpm lint`: reglas de React/Vite y capas de features.
- `pnpm structure:check`: estructura y nombres.
- `pnpm typecheck`: contrato TypeScript estricto.
- `pnpm test`: pruebas de dominio, aplicación y presentación.
- `pnpm quality`: novedades y todos los checks anteriores.
- `pnpm build`: compilación estática de Vite y generación del árbol de rutas.

Revisar `.githooks/` y ejecutar `pnpm hooks:install` una vez por clon para activar
el pre-commit de `pnpm quality:quick` (formato y lint, sin fixes). Rehúsa reemplazar
hooks existentes. CI verifica el contenido del commit; los required checks de
GitHub se configuran aparte.

## Despliegue y operación

1. Aplica migraciones compatibles y valida RLS, numeración, saldos y datos históricos en staging.
2. Despliega las funciones Edge con sus secretos de servidor y la configuración de JWT indicada en `supabase/config.toml`.
3. Despliega el frontend con sus dos variables públicas; comprueba aceptación, envío, factura y cobro con cuentas de prueba separadas.
4. Observa errores de guardado, operaciones pendientes, correo, renovaciones y webhooks. Un error de guardado deja el cambio visible y ofrece reintento; no equivale a confirmación del servidor.

Las integraciones externas pendientes requieren proveedor elegido, credenciales, pruebas de contrato y validación productiva antes de activarse. El catálogo de planes se rige por el [plan comercial](docs/COMMERCIAL_PLAN.md), no por etiquetas de interfaz.

## Versiones

CI valida cada push a `main` y después incrementa la versión patch, genera `CHANGELOG.md` y `src/shared/lib/changelog.json`, y etiqueta la release. Un cambio manual de versión se respeta. Usa `pnpm changelog:sync` para actualizar los archivos generados y no los edites manualmente.
