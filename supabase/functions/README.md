# Edge Functions

Implementa aquí únicamente operaciones privilegiadas o con efectos externos:
webhooks, emisión fiscal, pagos, emails y acciones con service role. Cada
función valida input, sesión, tenant y permisos antes de actuar.

## Redsys de Menoslios

`billing` admite `https://app.menoslios.com` y el origen HTTPS anterior
configurado en `APP_URL`. El alta real queda cerrada por defecto: solo abrir
`MENOSLIOS_ONBOARDING_PAYMENTS_LIVE=true` cuando estén validados el TPV
recurrente, el circuito fiscal y la agenda de puesta en marcha.

El banco debe facilitar código de comercio, terminal y clave de firma del
entorno correspondiente, y confirmar la operativa COF/MIT recurrente.
Configura esos valores solo en los secretos de Edge Functions
(`REDSYS_MERCHANT_CODE`, `REDSYS_TERMINAL`, `REDSYS_SECRET_KEY`,
`REDSYS_ENVIRONMENT`; `REDSYS_CURRENCY` vale 978 por defecto). Configura
también `REDSYS_REFERENCE_KEY`, separada de la clave de firma, para cifrar las
referencias (genera al menos 32 bytes aleatorios y usa su Base64). No rotarla sin un plan de migración para tarjetas ya vinculadas.
En test, no utilizar el webhook de producción: bloquea avisos de sandbox y
no genera facturas de prueba.
