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
de los de Workers. Workers Free limita la CPU por petición y puede no ser suficiente
para informes: medir con informes reales y contratar Workers Paid si es necesario.
El proyecto `wrangler.probe.jsonc` es solo para pruebas locales y nunca debe desplegarse.
