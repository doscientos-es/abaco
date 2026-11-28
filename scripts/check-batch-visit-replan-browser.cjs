// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Run against Vite preview on 4205 with PLAYWRIGHT_MODULE and CHROMIUM_PATH set.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4205'
const supabase = 'http://localhost:54399'
const tenant = '00000000-0000-4000-8000-000000000100'
const admin = '00000000-0000-4000-8000-000000000110'
const second = '00000000-0000-4000-8000-000000000111'
const day = '2026-11-27'

function fixture(id, hour, assignee = admin) {
  const stamp = (h) => `${day}T${String(h).padStart(2, '0')}:00:00Z`
  return {
    id,
    title: `Visita ${id}`,
    assigned_user_id: assignee,
    assigned_user_name: 'Técnico de prueba',
    status: 'scheduled',
    priority: 'normal',
    scheduled_start_at: stamp(hour),
    scheduled_end_at: stamp(hour + 1),
    updated_at: `${day}T01:00:00Z`,
    timezone: 'Europe/Madrid',
    client_name: 'Cliente ficticio',
    location_name: 'Oficina',
    address: '',
    notes: '',
  }
}

async function run() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  try {
    const context = await browser.newContext({
      viewport: { width: 320, height: 700 },
      serviceWorkers: 'block',
    })
    const exp = Math.floor(Date.now() / 1000) + 3600
    const user = {
      id: admin,
      email: 'admin@example.test',
      user_metadata: {},
      app_metadata: {},
      aud: 'authenticated',
    }
    const token = Buffer.from(JSON.stringify({ sub: admin, exp })).toString('base64url')
    await context.addInitScript(
      (session) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)),
      {
        user,
        expires_at: exp,
        access_token: `eyJhbGciOiJIUzI1NiJ9.${token}.fixture`,
        refresh_token: 'fixture',
      },
    )
    const a = fixture('alfa', 8)
    const b = fixture('beta', 9)
    const c = fixture('gamma', 11, second)
    const conflict = fixture('delta', 13, second)
    const visits = [a, b, c, conflict]
    const writes = []
    const stored = new Set()
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== supabase) return route.abort()
      const json = (value, status = 200) =>
        route.fulfill({
          json: value,
          status,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': '*',
          },
        })
      if (request.method() === 'OPTIONS') return json(null)
      switch (url.pathname.split('/').at(-1)) {
        case 'my_company_memberships':
          return json([{ tenant_id: tenant, company_name: 'Empresa de pruebas', role: 'admin' }])
        case 'company_onboarding_status':
        case 'is_platform_superadmin':
          return json(null)
        case 'tenant_can_write':
        case 'can_use_staff':
          return json(true)
        case 'tenants':
          return json([{ id: tenant, name: 'Empresa de pruebas' }])
        case 'list_office_visits': {
          const { p_tenant_id, p_from, p_to } = request.postDataJSON()
          assert.equal(p_tenant_id, tenant)
          return json(p_from <= day && day <= p_to ? visits : [])
        }
        case 'service_visits':
          return json(visits.map(({ id }) => ({ id, work_team_id: null, route_order: 0 })))
        case 'replan_service_visit': {
          const payload = request.postDataJSON()
          assert.equal(payload.p_tenant_id, tenant)
          assert.equal(payload.p_expected_updated_at, `${day}T01:00:00Z`)
          assert.match(payload.p_operation_id, /^[0-9a-f-]{36}$/)
          writes.push(payload)
          const target = visits.find(({ id }) => id === payload.p_visit_id)
          assert.notEqual(target, conflict)
          assert.equal(payload.p_assigned_user_id, target.assigned_user_id)
          if (stored.has(payload.p_operation_id)) return json(target.id)
          stored.add(payload.p_operation_id)
          const current = Date.parse(target.scheduled_start_at)
          assert.equal(payload.p_scheduled_start_at, new Date(current + 3_600_000).toISOString())
          assert.equal(payload.p_scheduled_end_at, new Date(current + 7_200_000).toISOString())
          target.scheduled_start_at = payload.p_scheduled_start_at
          target.scheduled_end_at = payload.p_scheduled_end_at
          target.updated_at = `${day}T02:00:00Z`
          if (target === b) return json({ message: 'Respuesta del servidor perdida.' }, 503)
          return json(target.id)
        }
        default:
          return json([])
      }
    })

    const page = await context.newPage()
    await page.goto(`${origin}/trabajos?view=list&period=day&date=${day}`)
    const opener = page.getByRole('button', { name: 'Reprogramar varias visitas' })
    await opener.and(page.locator('button:not([disabled])')).waitFor({ timeout: 8000 })
    await opener.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Reprogramar varias visitas' })
    for (const name of ['alfa', 'beta', 'gamma']) {
      await dialog.getByRole('checkbox', { name: new RegExp(`Visita ${name}`) }).press('Space')
    }
    await dialog.getByLabel('Cantidad').fill('2')
    assert.equal(writes.length, 0)
    await dialog.getByRole('button', { name: 'Preparar propuesta' }).press('Enter')
    await dialog.getByText('Coincide con «Visita delta» en la agenda actual.').waitFor()
    assert.equal(
      await dialog.getByRole('button', { name: 'Confirmar 3 cambios' }).isDisabled(),
      true,
    )
    assert.equal(writes.length, 0)
    await dialog.getByRole('button', { name: 'Editar propuesta' }).press('Enter')
    await dialog.getByLabel('Cantidad').fill('1')
    await dialog.getByRole('button', { name: 'Preparar propuesta' }).press('Enter')
    const row = (name) =>
      dialog.getByRole('listitem').filter({
        has: page.getByText(`Visita ${name}`, { exact: true }),
      })
    await row('alfa').getByText('27/11/2026 · 09:00').waitFor()
    await row('alfa').getByText('27/11/2026 · 10:00').waitFor()
    assert.equal(writes.length, 0)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    )
    await dialog.getByRole('button', { name: 'Confirmar 3 cambios' }).press('Enter')
    await dialog.getByText(/1 de 3 cambios confirmados. Resultado parcial/).waitFor()
    await row('alfa').getByText('No intentada:').waitFor()
    await row('beta').getByText('Sin confirmar:').waitFor()
    await row('gamma').getByText('Aplicada:').waitFor()
    assert.deepEqual(
      writes.map(({ p_visit_id }) => p_visit_id),
      ['beta', 'gamma'],
    )
    await dialog.getByRole('button', { name: 'Reintentar pendientes' }).press('Enter')
    await dialog.getByText('3 de 3 cambios confirmados.').waitFor()
    assert.deepEqual(
      writes.map(({ p_visit_id }) => p_visit_id),
      ['beta', 'gamma', 'beta', 'alfa'],
    )
    assert.deepEqual(writes[0], writes[2])
    assert.equal(stored.size, 3)
    await dialog.getByRole('button', { name: 'Cerrar resultados' }).press('Enter')
    await dialog.waitFor({ state: 'hidden' })
    await page.reload()
    const current = page
      .locator('ol > li')
      .filter({ has: page.getByText('Visita alfa', { exact: true }) })
    await current.getByText(/10:00/).waitFor()
    assert.equal(conflict.updated_at, `${day}T01:00:00Z`)
    process.stdout.write(
      'Batch visit Chromium 320px: keyboard, preview without writes, conflict, partial result, idempotent retry and reload.\n',
    )
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
