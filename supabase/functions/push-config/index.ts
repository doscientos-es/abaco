// The public VAPID key is safe to expose; the private key remains server-side.
Deno.serve((request) => {
  const origin = Deno.env.get('APP_URL') ?? ''
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return new Response(null, { status: 405, headers })
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  if (!publicKey) return new Response(null, { status: 503, headers })
  return Response.json({ publicKey }, { headers })
})