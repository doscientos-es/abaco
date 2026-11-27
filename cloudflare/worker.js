// The Vercel Node.js endpoints are not yet available on Cloudflare. Never
// serve the SPA shell as a successful API response while testing the frontend.
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      return Response.json({ error: 'api_not_available_on_cloudflare' }, { status: 503 })
    }
    return env.ASSETS.fetch(request)
  },
}
