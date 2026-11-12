# Ábaco

Ábaco es una aplicación multiempresa de Doscientos para autónomos y empresas de
servicios e instalaciones. Reúne la gestión comercial, la planificación de visitas,
el trabajo de campo y el seguimiento de facturas y cobros.

La aplicación usa React y TypeScript en el frontend, Supabase para datos y servicios,
y funciones TypeScript en Vercel para los PDF de partes de visita.

## Qué permite hacer

| Área                       | Funcionalidad                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clientes y catálogo        | Clientes, contactos, ubicaciones, instalaciones, equipos y conceptos reutilizables.                                                                                        |
| Presupuestos               | Preparar propuestas, publicarlas y registrar la respuesta del cliente o una aceptación manual. La oficina puede convertir una propuesta aceptada en un trabajo o contrato. |
| Contratos                  | Configurar contratos recurrentes, sus trabajos, frecuencias, visitas y periodos de facturación.                                                                            |
| Planificación              | Consultar conjuntamente las visitas de contratos y las independientes, revisar partes y acceder a trabajos anteriores sin contrato.                                        |
| Trabajo de campo           | Consultar visitas asignadas en **Mi jornada**, registrar partes, mediciones, actividades, fotos e incidencias y completar visitas.                                         |
| Facturación y contabilidad | Revisar borradores, emitir facturas, registrar cobros y gastos, y consultar costes y márgenes provisionales.                                                               |
| Equipo                     | Gestionar miembros, equipos de trabajo y vacaciones.                                                                                                                       |

Los informes cerrados pueden compartirse mediante enlaces temporales revocables,
correo y PDF. La generación de visitas o borradores no implica la emisión ni el
envío automático de una factura.

**Estado:** el repositorio contiene funcionalidad en evolución. La existencia de
código o migraciones no garantiza su despliegue ni su validación en un entorno.
Quedan pendientes, entre otros, la firma digital del cliente, la asignación de
visitas a equipos y partes del circuito operativo. Consulta el
[flujo operativo](docs/FLUJO_OPERATIVO.md) y comprueba su fecha y sus referencias
a ramas antes de usarlo como estado actual.

### Acceso y seguridad

La interfaz distingue administrador y usuario: el primero gestiona la empresa;
el segundo accede a sus visitas asignadas, vacaciones y ajustes personales. La
pertenencia y los datos están asociados a una empresa. Los controles de interfaz
no sustituyen las políticas RLS de Supabase ni las comprobaciones del servidor.

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
con la base de datos. Redsys tramita el cobro de la suscripción de Ábaco. Existe
además una oferta informativa Escala, que no es un plan de pago de Redsys.
El [plan comercial](docs/producto/PLAN_COMERCIAL.md) recoge la oferta, el piloto y
sus hipótesis; las cifras previstas no son resultados medidos.

## Recorrido principal

1. La oficina registra el cliente y prepara un presupuesto con los conceptos del catálogo.
2. Publica la propuesta y registra su aceptación. Después puede convertirla manualmente
   en el trabajo o contrato elegido, conservando la versión aceptada.
3. Desde **Contratos** configura los trabajos contratados; desde **Planificación**
   organiza conjuntamente visitas recurrentes e independientes y revisa los partes.
4. El usuario asignado realiza la visita desde **Mi jornada** y completa el parte.
   Los borradores y envíos pendientes se conservan en el dispositivo para reintentar;
   la visita no se completa mientras haya mediciones o fotos pendientes allí.
5. El cierre conserva una instantánea del parte, pone en cola su PDF y crea un pendiente
   de revisión de facturación. La oficina revisa los borradores antes de emitir facturas
   y registra los cobros por separado.

Los equipos se pueden asignar a trabajos, pero no sustituyen la asignación individual
de visitas ni cambian los permisos. Las aceptaciones manuales y la conformidad en papel
no deben confundirse con una firma digital del cliente.

## Documentación

- [Guía de uso](GUIA_DE_USO.md): recorrido de oficina y campo. Es una guía fechada;
  algunas etiquetas de navegación y roles han cambiado desde su publicación.
- [Flujo operativo](docs/FLUJO_OPERATIVO.md): objetivos, límites y decisiones pendientes.
- [Índice de documentación](docs/README.md): producto, decisiones y demos históricas.
- [Equipos de trabajo](docs/decisiones/WORK_TEAMS.md) y
  [ausencias y cobertura](docs/decisiones/COBERTURA_DE_VACACIONES.md).

## Desarrollo local

Requisitos: Node.js 22.18 o posterior y pnpm 9.15.2. Las pruebas locales de
base de datos también requieren Docker y Supabase CLI 2.116.0.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local`
con los valores de un proyecto autorizado. Son públicos: la protección de los
datos depende de RLS y de las comprobaciones del backend. No hay modo ficticio
que sustituya a Supabase. `pnpm dev` ejecuta Vite; no levanta las funciones de
Vercel ni las funciones Edge de Supabase.

Nunca pongas la clave `service_role`, secretos de Redsys o Resend ni otras
credenciales en variables `VITE_*` o en archivos versionados. Configura los
secretos exclusivamente en el entorno de servidor correspondiente.

### Integraciones de informes e invitaciones

- **Invitaciones:** `APP_URL` determina el enlace. Para permitir otros orígenes,
  configura `INVITE_ALLOWED_ORIGINS` en Supabase Edge como lista separada por comas;
  permite localhost solo en entornos autorizados. CORS no sustituye la autenticación.
- **PDF de partes:** las funciones Node.js de Vercel necesitan `SUPABASE_URL` y
  `SUPABASE_SERVICE_ROLE_KEY` en el servidor. Para la cola, configura también
  `CRON_SECRET` en Vercel con el mismo valor de `cron_secret` en Supabase Vault,
  y `visit_report_pdf_worker_url` en Vault con la URL HTTPS de
  `/api/visit_report_pdf_worker`. El trabajador procesa la cola con reintentos;
  la descarga pública también puede generar el PDF si aún no está disponible.
- **Correo del parte:** configura los secretos Edge `REPORT_DELIVERY_KEY` (32 bytes
  en Base64), `RESEND_API_KEY`, `RESEND_FROM`, `APP_URL` y `CRON_SECRET`. En Vault,
  configura `cron_secret` con el mismo valor y `visit_report_email_worker_url` con
  la URL HTTPS de `visit-report-email-worker`. Conserva la clave de cifrado mientras
  haya entregas pendientes: cambiarla impide descifrar sus enlaces. Los reintentos
  automáticos se detienen tras 23 horas para evitar duplicados fuera de la ventana
  de idempotencia del proveedor.
- **Eventos de correo:** configura `RESEND_WEBHOOK_SECRET` en Edge y registra en
  Resend `/functions/v1/visit-report-email-events` para `email.delivery_delayed`,
  `email.delivered`, `email.bounced`, `email.complained`, `email.failed` y
  `email.suppressed`. Verifica la entrega de eventos con un envío de prueba.

Otras integraciones, como pagos o envío de documentos, requieren su propia
configuración y validación. Consulta las funciones correspondientes antes de activarlas.

## Arquitectura y organización

El frontend usa React 19, Vite, TypeScript, TanStack Router y Query, Tailwind CSS
y `@doscientos/ui`. Las funcionalidades se agrupan en `src/features` con capas de
dominio, aplicación, infraestructura e interfaz según sus necesidades. La URL
pertenece al router y la caché remota a TanStack Query.

| Carpeta                   | Responsabilidad                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/app`                 | Router, consultas compartidas y marco de la aplicación.                                                |
| `src/routes`              | Rutas y comprobaciones de acceso. `routeTree.gen.ts` se genera automáticamente.                        |
| `src/features`            | Pantallas y casos de uso por funcionalidad.                                                            |
| `src/shared/domain`       | Tipos y cálculos sin dependencia del proveedor de datos.                                               |
| `src/shared/store`        | Estado heredado y adaptador de Supabase. Se sustituirá gradualmente por comandos y consultas acotadas. |
| `src/shared/ui`           | Componentes compartidos, incluidos estados de carga, error y contenido vacío.                          |
| `api`                     | Endpoints Node.js de Vercel para descarga y procesamiento de PDF de partes.                            |
| `server/visit-report-pdf` | Proyección, renderizado y acceso a datos para esos PDF. Usa `@react-pdf/renderer` y `sharp`.           |
| `supabase/migrations`     | Esquema, restricciones, funciones transaccionales y RLS.                                               |
| `supabase/functions`      | Funciones Edge para enlaces públicos, correos, invitaciones y facturación SaaS.                        |
| `supabase/tests/database` | Pruebas SQL con pgTAP.                                                                                 |

El frontend, las funciones Edge y las funciones de PDF están escritos en
TypeScript; no se necesita Python para la generación de PDF.

## Base de datos y pruebas

El contrato completo para la aplicación es `pnpm quality`, también para agentes y CI:

- `pnpm format:check`: formato compartido.
- `pnpm lint`: reglas de React/Vite y capas de features.
- `pnpm structure:check`: estructura y nombres.
- `pnpm typecheck`: contrato TypeScript estricto.
- `pnpm test`: pruebas de dominio, aplicación y presentación.
- `pnpm changelog:check`: comprueba los archivos de novedades generados.
- `pnpm quality`: changelog y todos los checks anteriores.
- `pnpm build`: sincronización de changelog, TypeScript y compilación de Vite.

Revisa `.githooks/` y ejecuta `pnpm hooks:install` una vez por clon: el pre-commit
ejecuta `pnpm quality:quick` y el pre-push ejecuta `pnpm quality`. La instalación
rehúsa reemplazar hooks existentes.

### Base de datos

Las migraciones están en `supabase/migrations` y las pruebas pgTAP en
`supabase/tests/database`. Crea nuevas migraciones con
`supabase migration new <nombre>` y sigue las instrucciones de `AGENTS.md` para
aplicarlas al entorno correspondiente.

**Limitación actual:** el job de base de datos de CI referencia
`scripts/prepare-db-replay.mjs`, que no está presente en el árbol de trabajo.
Hasta recuperarlo o reemplazarlo, ese procedimiento y las pruebas pgTAP de CI no
son ejecutables tal como están configurados. El historial requiere un replay en
orden de dependencias con versiones sintéticas; no asumas que un reset directo
con los nombres originales es equivalente. Usa solo bases desechables para
pruebas, nunca las enlaces a producción ni uses su historial para reparaciones.

Antes de aplicar cambios a un proyecto con datos, compara esquema e historial,
verifica copias y restauración en staging y prueba los datos existentes. No
ejecutes `db reset` en producción.

## Despliegue y operación

1. Aplica migraciones compatibles y valida RLS, numeración, saldos y datos históricos en staging.
2. Despliega las funciones Edge con sus secretos de servidor y la configuración de JWT indicada en `supabase/config.toml`.
3. Despliega en Vercel el frontend y las funciones de PDF con su configuración; valida los endpoints y las colas en el entorno de destino.
4. Comprueba aceptación, envío, factura y cobro con cuentas de prueba separadas.
5. Observa errores de guardado, operaciones pendientes, correo, renovaciones y webhooks. Un error de guardado no equivale a confirmación del servidor.

Las integraciones externas pendientes requieren proveedor elegido, credenciales, pruebas de contrato y validación productiva antes de activarse. El catálogo de planes se rige por el [plan comercial](docs/producto/PLAN_COMERCIAL.md), no por etiquetas de interfaz.

## Versiones

El workflow de CI está configurado para validar los cambios y, tras un push a
`main` con las comprobaciones superadas, generar changelog y una versión
etiquetada. Sin embargo, la decisión de versión referencia
`scripts/release-decision.mjs`, ausente del árbol de trabajo: la publicación
automática también necesita recuperarlo o reemplazarlo. Usa `pnpm changelog:sync`
para actualizar `CHANGELOG.md` y `src/shared/lib/changelog.json`; no los edites
manualmente.
