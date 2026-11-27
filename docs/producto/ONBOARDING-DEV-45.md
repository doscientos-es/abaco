# Alta guiada de Ábaco · DEV-45

Alta de autoservicio: crear empresa → elegir módulos → licencias y periodo → confirmar datos
fiscales y pagar → reservar puesta en marcha → acceder. Las empresas anteriores y las creadas
directamente por Superadmin no reciben el nuevo requisito. No se cambia su plan ni su precio. Una cortesía concedida explícitamente por Superadmin también permite entrar sin pago ni agenda; no es una prueba automática.

## Reglas

- La fecha de prueba interna de una nueva empresa se fija al crearla, sin días de acceso.
  Se conservan las columnas antiguas porque las usa el sistema de suscripciones existente.
- Se reutiliza el catálogo estándar de Ábaco, sus precios sin IVA, módulos y facturación de
  suscripción. El servidor vuelve a calcular la selección dentro de la reserva de pago.
  Las plazas cuentan al administrador y a las invitaciones pendientes; no a trabajadores
  sin cuenta. Logística de proveedores no está a la venta. El MCP no se ofrece en el nuevo alta hasta verificar su activación real. No se cambia el catálogo ni el acceso de sus clientes existentes.
- IA incorpora la tarifa ya definida en el producto (3,75 €/mes o 45 €/año, sin IVA) y se
  aplica a la persona administradora titular, con el límite mensual existente. La renovación
  incorpora el módulo como en Trabajadores, Proveedores o MCP. No habilita IA a todos los usuarios.
- Se conserva el único pago pendiente por tenant. No se genera otro cobro a partir del enlace
  de retorno si Redsys no ha confirmado el resultado. Ante una operación pendiente que no se
  resuelva, soporte debe confirmar su estado antes de reintentar. El pago abre solo la agenda.
- El acceso se abre cuando llega un evento de Cal.com firmado, de la actividad esperada,
  con una cita aceptada y la referencia de esa empresa y el correo del titular. El primer
  evento válido es idempotente. Cambiar o cancelar la cita después no revoca el acceso.
- Los primeros pasos se muestran según los datos que faltan. En Trabajadores, la llamada a
  importar reutiliza el diálogo de Excel/CSV y aparece si el módulo es accesible y hay más de
  una plaza contratada.

## Configuración y puesta en marcha

Solo hay tres valores específicos de Cal: URL de reserva, ID numérico y secreto de firma.
Se configuran con estos nombres y destinos:

| Dónde                                  | Variable                                | Valor                       |
| -------------------------------------- | --------------------------------------- | --------------------------- |
| Cloudflare Workers Builds, al compilar | `VITE_MENOSLIOS_ONBOARDING_BOOKING_URL` | URL pública del evento      |
| Supabase, Edge Function Secrets        | `MENOSLIOS_CAL_BOOKING_URL`             | La misma URL exacta         |
| Supabase, Edge Function Secrets        | `MENOSLIOS_CAL_EVENT_TYPE_ID`           | ID numérico del evento      |
| Supabase, Edge Function Secrets        | `MENOSLIOS_CAL_WEBHOOK_SECRET`          | Secreto privado del webhook |

La URL se configura en ambos destinos porque el navegador abre la agenda y el servidor
comprueba que coincide antes de iniciar el cobro. No poner el secreto en variables `VITE_`.
Las variables antiguas `VITE_ABACO_ONBOARDING_BOOKING_URL` y `ABACO_CAL_*` siguen siendo
compatibles durante la transición; no hace falta configurar ambas versiones. No borrar las
antiguas de producción hasta configurar y verificar las nuevas.

1. Preparar en Cal.com un enlace exclusivo para la puesta en marcha, enlazado a los calendarios
   de disponibilidad de Doscientos. Activar confirmación inmediata (sin aprobación manual).
   Copiar su URL pública para ambas variables de URL. En Links, abrir el menú de tres puntos
   del enlace y elegir Troubleshoot: el número tras `eventTypeId=` en la URL es el ID numérico
   ([ayuda de Cal.com](https://cal.com/help/event-types/link-id)).
2. Añadir una pregunta de texto obligatoria **Referencia de Ábaco** con identificador
   `abaco_reference`. Ábaco la prerrellena en la URL y muestra el código por si es necesario copiarlo.
3. En Settings → Developer → Webhooks, configurar un webhook para `BOOKING_CREATED` con el
   payload estándar, no una plantilla personalizada. Destino:
   `<SUPABASE_URL>/functions/v1/onboarding-cal-webhook`. Elegir una clave aleatoria segura,
   guardarla tanto en Cal.com como en `MENOSLIOS_CAL_WEBHOOK_SECRET` y conservarla en un
   gestor de secretos: Cal.com no permite verla tras guardar
   ([ayuda de Cal.com](https://cal.com/help/webhooks)).
4. Configurar las cuatro variables de la tabla. Si falta la agenda o las URL no coinciden,
   no se inicia el cobro. El ID y el secreto también son necesarios para verificar la reserva.
5. Coordinar la migración y el deploy de `billing`, `invite-member` y
   `onboarding-cal-webhook`; luego publicar el frontend. No poner el flujo a disposición
   de clientes hasta comprobar el callback autenticado de agenda y el cobro de prueba.
   El webhook de Redsys y el circuito fiscal existente siguen siendo necesarios.
6. El código de producción conserva la prohibición existente de mezclar credenciales Redsys
   sandbox con la facturación real de Ábaco. Validar de extremo a extremo con un comercio y
   destino de facturación aislados si están disponibles, nunca cambiando el comercio de
   producción solo para ensayar.

## Verificación

- `pnpm exec vitest run src/routes/root-session.test.ts src/features/onboarding src/shared/domain/company-onboarding-migration.test.ts supabase/functions/_shared/onboarding-cal.test.ts`
  comprueba selección, cálculo, rutas, RLS de tablas operativas, rechazo de acceso cruzado,
  reserva idempotente y validación del webhook con una clave ficticia.
- La prueba PGlite ejecuta la migración nueva con tablas mínimas y un doble del adaptador
  fiscal. No certifica que el historial completo de migraciones o la firma/calendario externos
  se hayan desplegado en el proyecto real.
- Los datos de ejemplo para las vistas de módulos son ficticios. No incluyen capturas de empresas reales.

- Prueba en Chromium (navegador real, datos ficticios, sin conexiones a proveedores):
  arranca Vite con `VITE_SUPABASE_URL=http://localhost:54399`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=fixture-not-a-key` y
  `VITE_MENOSLIOS_ONBOARDING_BOOKING_URL=https://cal.eu/doscientos/onboarding`
  en `127.0.0.1:4179`. Ejecuta `node scripts/check-onboarding-browser.cjs`
  con Playwright disponible, o con `PLAYWRIGHT_MODULE` apuntando a una instalación
  de herramientas separada. El guion abre Chromium, prueba el alta, declina y confirma
  pagos de ficción, verifica la firma de agenda, materializa el resultado en PGlite y
  confirma el acceso de cortesía por separado. No necesita credenciales ni Docker.

## Menoslios: alta CRM y contexto para Gerard

El alta confirmada de una empresa nueva genera un trabajo persistente de tipo
`registration`. Una reserva firmada, del evento configurado y del correo del
administrador de una empresa de pago genera un trabajo `booking`. La cola no
guarda datos fiscales ni secretos, se reintenta sin duplicar la ficha y no
bloquea el onboarding si el backoffice está temporalmente caído.

Despliega `menoslios-crm` (sin JWT externo, autentica con el `CRON_SECRET` ya
configurado) y configura `MENOSLIOS_CRM_ENDPOINT` con la URL HTTPS exacta del
endpoint `/api/webhooks/menoslios` del backoffice y `MENOSLIOS_CRM_SECRET` con
una clave nueva, de 32 caracteres como mínimo, también en el backoffice.
No reutilices la clave de Cal.com ni la de facturación. Configura allí
`MENOSLIOS_CALENDAR_SUBJECT=gerard@doscientos.es` y la delegación de Google
Calendar existente. El cliente recibe la cita normal de Cal.com; el contexto
se crea en el calendario principal de Gerard como evento privado, libre y sin
invitados. Este flujo copia únicamente las reservas iniciales, no los cambios
o cancelaciones posteriores. No hace backfill de cuentas existentes.
