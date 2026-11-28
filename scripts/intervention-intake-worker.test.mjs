import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const token = 'a'.repeat(64)
const app = 'https://app.example.test'
const project = 'https://supabase.example.test'
let log

function req(extraHeaders = {}, path = 'check', body = '{}') {
  return new Request(`${app}/api/intervention-request/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: app,
      'sec-fetch-site': 'same-origin',
      'x-request-invitation': token,
      ...extraHeaders,
    },
    body,
  })
}

function environment(extra = {}) {
  return {
    APP_URL: app,
    SUPABASE_URL: project,
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-role',
    ...extra,
  }
}

async function worker() {
  vi.resetModules()
  const { interventionIntake } = await import('../cloudflare/intervention-intake.js')
  return interventionIntake
}

const upstream = () => vi.fn(() => Promise.resolve(Response.json(null)))

beforeEach(() => {
  log = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  log.mockRestore()
  vi.useRealTimers()
})

describe('intervention intake Worker production adapter', () => {
  it('uses the trusted native limiter first and never goes around a denial', async () => {
    const run = await worker()
    const fetcher = upstream()
    const limit = vi
      .fn()
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true })
    const env = environment({ INTERVENTION_IP_LIMITER: { limit } })
    const request = () =>
      req({ 'cf-connecting-ip': '2001:db8::1', 'x-forwarded-for': '198.51.100.7' })
    expect((await run(request(), env, fetcher)).status).toBe(429)
    expect(fetcher).not.toHaveBeenCalled()
    const response = await run(request(), env, fetcher)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'unavailable_link' })
    expect(limit).toHaveBeenNthCalledWith(1, { key: 'intake:2001:db8::1' })
    expect(limit).toHaveBeenNthCalledWith(2, { key: 'intake:2001:db8::1' })
    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.lastCall
    expect(url.href).toBe(`${project}/rest/v1/rpc/guard_intervention_intake`)
    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        apikey: 'fixture-service-role',
        Authorization: 'Bearer fixture-service-role',
      },
    })
    expect(JSON.parse(init.body)).toEqual({
      p_token_hash: 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
      p_op: null,
      p_with_photos: null,
    })
    expect(log).not.toHaveBeenCalled()
  })

  it('shares ten rolling admissions across missing and throwing bindings or missing IP, without reading submit bodies', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(100_000)
    const run = await worker()
    const fetcher = upstream()
    const trust = { 'cf-connecting-ip': '198.51.100.7' }
    const failed = vi.fn().mockRejectedValue(new Error('do not log this'))
    const unused = vi.fn().mockResolvedValue({ success: true })
    for (let index = 0; index < 10; index++) {
      // Stagger timestamps: the first request expires but the others remain in the rolling window.
      vi.setSystemTime(100_000 + index * 1_000)
      const input =
        index % 3 === 0
          ? [req(trust), environment()]
          : index % 3 === 1
            ? [req(trust), environment({ INTERVENTION_IP_LIMITER: { limit: failed } })]
            : [
                req({ 'x-forwarded-for': '198.51.100.7' }),
                environment({ INTERVENTION_IP_LIMITER: { limit: unused } }),
              ]
      expect((await run(...input, fetcher)).status).toBe(404)
    }
    const denied = req(
      {
        ...trust,
        'x-request-operation': '77000000-0000-4000-8000-000000000001',
        'x-request-photo-mode': 'text',
      },
      'submit',
      'not JSON and must not be read',
    )
    vi.setSystemTime(159_999)
    expect((await run(denied, environment(), fetcher)).status).toBe(429)
    expect(denied.bodyUsed).toBe(false)
    expect(unused).not.toHaveBeenCalled()
    expect(failed).toHaveBeenCalledTimes(3)
    expect(fetcher).toHaveBeenCalledTimes(10)
    vi.setSystemTime(160_000)
    expect((await run(req(trust), environment(), fetcher)).status).toBe(404)
    expect((await run(req(trust), environment(), fetcher)).status).toBe(429)
    const output = JSON.stringify(log.mock.calls)
    expect(output).toContain('edge_client_ip_unavailable')
    expect(output).toContain('edge_rate_binding_failed')
    expect(output).toContain('edge_rate_binding_unavailable')
    expect(output).not.toMatch(/198\.51\.100\.7|do not log|fixture-service-role/i)
  })

  it('preserves strict same-origin handling and opaque credentials only use apikey', async () => {
    const run = await worker()
    const fetcher = upstream()
    const limit = vi.fn().mockResolvedValue({ success: true })
    const env = environment({
      SUPABASE_URL: '',
      VITE_SUPABASE_URL: project,
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture',
      INTERVENTION_IP_LIMITER: { limit },
    })
    expect(
      (
        await run(
          req({ origin: 'https://untrusted.example.test', 'cf-connecting-ip': '198.51.100.7' }),
          env,
          fetcher,
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await run(
          req({ 'sec-fetch-site': 'cross-site', 'cf-connecting-ip': '198.51.100.7' }),
          env,
          fetcher,
        )
      ).status,
    ).toBe(403)
    expect(limit).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
    expect((await run(req({ 'cf-connecting-ip': '198.51.100.7' }), env, fetcher)).status).toBe(404)
    expect(fetcher.mock.lastCall[0].origin).toBe(project)
    expect(fetcher.mock.lastCall[1].headers).toEqual({
      'Content-Type': 'application/json',
      apikey: 'sb_secret_fixture',
    })
  })

  it('does not confuse unconfigured or failed RPC with an unavailable invite or log its contents', async () => {
    const run = await worker()
    const fetcher = upstream()
    const limit = vi.fn().mockResolvedValue({ success: true })
    const request = () => req({ 'cf-connecting-ip': '198.51.100.7' })
    const env = environment({ INTERVENTION_IP_LIMITER: { limit } })
    const missing = await run(request(), { ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }, fetcher)
    expect(missing.status).toBe(503)
    expect(await missing.json()).toEqual({ error: 'try_again' })
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockResolvedValueOnce(
      Response.json({ message: 'sensitive upstream body' }, { status: 403 }),
    )
    const failed = await run(request(), env, fetcher)
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({ error: 'try_again' })
    expect(log.mock.calls).toEqual([
      ['intervention_intake', 'rpc_not_configured'],
      ['intervention_intake', 'rpc_http_error', 403],
    ])
  })
})
