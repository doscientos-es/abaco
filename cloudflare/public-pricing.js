const landingOrigins = new Set(['https://menoslios.com', 'https://www.menoslios.com'])

// A deliberately public, read-only endpoint. Never forward caller cookies,
// authorization or query params to the database.
export async function publicPricing(request, env, fetcher = fetch) {
  const origin = request.headers.get('origin')
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  })
  if (origin && landingOrigins.has(origin)) headers.set('Access-Control-Allow-Origin', origin)
  if (request.method !== 'GET') {
    headers.set('Allow', 'GET')
    return new Response('{"error":"method_not_allowed"}', { status: 405, headers })
  }
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (url && key?.startsWith('sb_publishable_')) {
    try {
      const upstream = await fetcher(new URL('/rest/v1/rpc/menoslios_public_pricing', url), {
        headers: { apikey: key, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      if (upstream.ok) {
        const value = await upstream.json()
        if (Number.isSafeInteger(value?.base_monthly_cents) && Array.isArray(value.modules)) {
          return new Response(JSON.stringify(value), { headers })
        }
      }
    } catch {
      // The public page offers a retry instead of showing a stale or invented price.
    }
  }
  return new Response('{"error":"pricing_unavailable"}', { status: 503, headers })
}
