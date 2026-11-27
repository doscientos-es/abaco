# Cloudflare frontend preview

This configuration deploys a frontend-only preview. It does not migrate the
Vercel API endpoints: `/api/*` returns 503 explicitly. Do not route the
production domain here until those endpoints, authentication redirects, Stripe
webhooks, scheduled PDF processing and the PWA have been migrated and tested.

Configure Workers Builds to use the repository root, `pnpm run build`, and
`npx wrangler deploy`. Use Node.js 22.18 or newer and pnpm 9.15.2. Set the
public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` build variables
for an isolated test environment. Never expose server secrets as VITE_ values.
Additional public VITE_ variables should match the selected test environment.
Preview deployments can be public: do not expose real customer data.

Cloudflare Workers Builds installs dependencies from the lockfile and reads
`wrangler.jsonc`. The SPA fallback handles browser routes; `_headers` keeps
the service worker update policy consistent with Vercel.
