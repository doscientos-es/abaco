# MenosLíos en Cloudflare Workers

Workers Builds: directorio raíz del repositorio, `pnpm run build` y
`pnpm exec wrangler deploy`. Para previews, usar `pnpm exec wrangler versions upload`.
El frontend necesita `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en
tiempo de compilación, además de las otras variables VITE que se utilicen.

Configurar en el Worker las variables de servidor existentes en Vercel: `APP_ORIGIN`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `STRIPE_CLIENT_ID`,
`STRIPE_SECRET_KEY`, `STRIPE_CONNECT_MODE`, `STRIPE_CONNECT_WEBHOOK_SECRET`,
`AI_PROVIDER`, `AI_MODEL` y las claves de IA requeridas por el proveedor. Las claves
privadas deben ser secretos del Worker, no variables `VITE_` ni archivos en Git.
`APP_ORIGIN` debe coincidir con el dominio HTTPS público de la aplicación.

Antes de mover el dominio, verificar login, datos, chat en streaming, conexión y
webhooks Stripe, generación y descarga de PDF con fotografías, y el procesamiento
programado. El proceso de Supabase usa `visit_report_pdf_worker_url` y `CRON_SECRET`;
verificar su configuración existente y las URL de callback de Stripe y Supabase.
No activar conexiones reales ni mover el tráfico mientras falte alguna comprobación.

El procesamiento de imágenes usa Cloudflare Images; su cuota y coste son independientes
de los de Workers. Solo se transforman las fotos al generar un PDF, sin modificar las
originales. En el plan Images Free hay hasta 5.000 transformaciones únicas al mes;
al agotarlas, las nuevas fallan y los trabajos de PDF se reintentan. Los planes de pago
pueden generar cargos. Workers Free limita la CPU por petición y puede no ser suficiente
para informes: medir con informes reales antes de decidir si se necesita Workers Paid.

Para ejecutar las pruebas locales de Workers y su simulación de Images, ejecutar
`node --test cloudflare/worker-smoke.test.mjs`. No usan Supabase real ni consumen la
cuota de Images. El proyecto `wrangler.probe.jsonc` es solo para pruebas locales y nunca
debe desplegarse. La simulación no sustituye la validación con imágenes reales en Cloudflare.

El portal de cliente utiliza la entrada Vite independiente `/portal-cliente`, sin el
arranque de sesión de la app, y `POST /api/customer_portal` en el Worker. El secreto de
lectura existe solo como fragmento al abrir el enlace y como hash en base de datos; la
API recibe el valor en el cuerpo, calcula el hash y no registra el cuerpo. Reusa los
secretos de servidor `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Antes de habilitarlo
verificar la migración de permisos, el Worker y la cabecera de no indexación/no caché
en el dominio de la aplicación. El smoke local, tras compilar, se ejecuta con
`node --test cloudflare/customer-portal-smoke.test.mjs` y usa exclusivamente datos de prueba.
No enviar un enlace real para la verificación.
