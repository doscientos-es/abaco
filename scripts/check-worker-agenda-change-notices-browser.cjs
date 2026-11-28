// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Run with Vite preview port 4207, PLAYWRIGHT_MODULE and CHROMIUM_PATH.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4207'
const supabase = 'http://localhost:54399'
const id = (value) => `ab670000-0000-4000-8000-${String(value).padStart(12, '0')}`
const tenant = id(1)
const person = id(2)
const visit = id(3)
const changed = id(4)
const seenTimestamp = '2026-11-28T13:20:00Z'

async function run() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  const context = await browser.newContext({
    viewport: { width: 320, height: 700 },
    timezoneId: 'Europe/Madrid',
    serviceWorkers: 'block',
  })
  let readUnavailable = true
  let acknowledgementUnavailable = true
  let assigned = true
  let queries = 0
  const writes = []
  const notice = {
    id: changed,
    visit_id: visit,
    visit_title: 'Revisión de ventilación',
    change_kind: 'rescheduled',
    changed_at: '2026-11-28T13:00:00Z',
    seen_at: null,
    before_start_at: '2026-11-29T08:00:00Z',
    before_end_at: '2026-11-29T09:00:00Z',
    before_timezone: 'Europe/Madrid',
    after_start_at: '2026-11-30T09:00:00Z',
    after_end_at: '2026-11-30T10:00:00Z',
    after_timezone: 'Europe/Madrid',
  }
  try {
    const user = {
      id: person,
      email: 'worker@example.test',
      aud: 'authenticated',
      user_metadata: {},
      app_metadata: {},
    }
    const exp = Math.floor(Date.now() / 1000) + 3600
    const payload = Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url')
    await context.addInitScript(
      (session) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)),
      {
        access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,
        refresh_token: 'fixture',
        expires_at: exp,
        user,
      },
    )
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== supabase) return route.abort()
      const send = (json, status = 200) =>
        route.fulfill({
          json,
          status,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': '*',
          },
        })
      if (request.method() === 'OPTIONS') return send(null)
      const name = url.pathname.split('/').at(-1)
      if (name === 'my_company_memberships')
        return send([{ tenant_id: tenant, company_name: 'Empresa Ficticia', role: 'user' }])
      if (name === 'company_onboarding_status') return send(null)
      if (name === 'tenant_can_write') return send(true)
      if (name === 'is_platform_superadmin') return send(false)
      if (name === 'user') return send(user)
      if (name === 'list_my_visit_agenda_change_notices') {
        assert.deepEqual(request.postDataJSON(), { p_tenant_id: tenant })
        queries += 1
        if (readUnavailable) return send({ message: 'Fixture read failure' }, 503)
        return send(assigned ? [notice] : [])
      }
      if (name === 'mark_my_visit_agenda_change_seen') {
        const payload = request.postDataJSON()
        assert.deepEqual(payload, { p_tenant_id: tenant, p_change_id: changed })
        writes.push(payload)
        if (acknowledgementUnavailable) return send({ message: 'Fixture write failure' }, 503)
        assert.equal(assigned, true)
        notice.seen_at = seenTimestamp
        return send(notice.seen_at)
      }
      assert.ok(
        ![
          'service_visit_events',
          'visit_agenda_change_notices',
          'clients',
          'service_locations',
        ].includes(name),
        `Should not query raw or office data for itinerary notices: ${name}`,
      )
      return send([])
    })

    const page = await context.newPage()
    page.setDefaultTimeout(8000)
    await page.goto(`${origin}/mi-jornada`)
    const block = page.getByRole('region', { name: 'Cambios de agenda' })
    await page
      .getByRole('alert')
      .getByText('No se pudieron consultar tus cambios de agenda.')
      .waitFor()
    assert.equal(writes.length, 0)
    readUnavailable = false
    await page.getByRole('button', { name: 'Reintentar cambios' }).press('Enter')
    await block.getByText('Cambió el horario').waitFor()
    await block.getByText('Revisión de ventilación').waitFor()
    await block.getByText(/Registrado:/).waitFor()
    await block.getByText(/Antes:.*9:00/).waitFor()
    await block.getByText(/Ahora:.*10:00/).waitFor()
    assert.equal(await block.getByText(/Enviado|Entregado|Leído/).count(), 0)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    )
    assert.equal(writes.length, 0)
    const acknowledgement = block.getByRole('button', { name: /Marcar como visto: Revisión/ })
    await acknowledgement.press('Enter')
    await block
      .getByRole('alert')
      .getByText(/No se pudo marcar/)
      .waitFor()
    assert.equal(await block.getByText(/Visto:/).count(), 0)
    acknowledgementUnavailable = false
    await acknowledgement.press('Enter')
    const seen = block.getByText(/Visto:/)
    await seen.waitFor()
    assert.equal(await seen.evaluate((element) => element === document.activeElement), true)
    assert.equal(await acknowledgement.count(), 0)
    assert.equal(writes.length, 2)
    await page.reload()
    await seen.waitFor()
    assert.equal(writes.length, 2)
    assigned = false
    const previousReads = queries
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/rpc/list_my_visit_agenda_change_notices') && response.ok(),
      ),
      page.reload(),
    ])
    await block.waitFor({ state: 'hidden' })
    assert.ok(queries > previousReads)
    assert.equal(writes.length, 2)
    process.stdout.write(
      'Worker agenda at 320px: no automatic acknowledgement, scoped list, keyboard retries, seen receipt, reload and revocation.\n',
    )
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
