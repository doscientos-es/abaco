import assert from 'node:assert/strict'
import { test } from 'node:test'

import { publicPricing } from './public-pricing.js'

const env = {
  VITE_SUPABASE_URL: 'https://supabase.example.test',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only',
}
const url = 'https://app.menoslios.com/api/public-pricing'

await test('serves the live public rate with CORS for the landing only', async () => {
  const response = await publicPricing(
    new Request(url, {
      headers: {
        origin: 'https://www.menoslios.com',
        cookie: 'unrelated=ignored',
        authorization: 'Bearer ignored',
      },
    }),
    env,
    (target, options) => {
      assert.equal(
        target.href,
        'https://supabase.example.test/rest/v1/rpc/menoslios_public_pricing',
      )
      assert.equal(options.headers.apikey, env.VITE_SUPABASE_PUBLISHABLE_KEY)
      assert.equal(options.headers.cookie, undefined)
      assert.equal(options.headers.authorization, undefined)
      return Response.json({ base_monthly_cents: 2900, modules: [] })
    },
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://www.menoslios.com')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { base_monthly_cents: 2900, modules: [] })
})

await test('never forwards writes or serves a fabricated price on outage', async () => {
  const post = await publicPricing(new Request(url, { method: 'POST' }), env, () =>
    assert.fail('unexpected upstream call'),
  )
  assert.equal(post.status, 405)
  const unavailable = await publicPricing(
    new Request(url, { headers: { origin: 'https://elsewhere.test' } }),
    env,
    () => new Response(null, { status: 502 }),
  )
  assert.equal(unavailable.status, 503)
  assert.equal(unavailable.headers.get('access-control-allow-origin'), null)
})
