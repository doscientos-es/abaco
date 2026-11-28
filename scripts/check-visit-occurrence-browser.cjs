// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Run against vite preview in port 4203 with PLAYWRIGHT_MODULE and CHROMIUM_PATH set.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4203'
const supabase = 'http://localhost:54399'
const tenant = '00000000-0000-4000-8000-000000000100'
const admin = '00000000-0000-4000-8000-000000000110'
const contract = '00000000-0000-4000-8000-000000000120'
const current = '2026-11-04'
const moved = '2026-11-05'
const next = '2026-11-07'

function fixture(id, day, recurring = true) {
  return {
    id,
    title: `Visita ${id}`,
    assigned_user_id: admin,
    assigned_user_name: 'Técnico de prueba',
    status: 'scheduled',
    priority: 'normal',
    scheduled_start_at: `${day}T08:00:00Z`,
    scheduled_end_at: `${day}T09:00:00Z`,
    updated_at: `${day}T01:00:00Z`,
    timezone: 'Europe/Madrid',
    client_name: 'Cliente ficticio',
    location_name: 'Oficina',
    address: '',
    notes: '',
    contract_occurrence_on: recurring ? day : null,
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
    const selected = fixture('de origen', current)
    const future = fixture('siguiente', next)
    const nonrecurring = fixture('puntual', current, false)
    const visits = [selected, future, nonrecurring]
    const futureBefore = structuredClone(future)
    let moveRequests = 0
    const skipRequests = []
    const recordedSkips = new Set()
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
        case 'memberships':
          return json([
            {
              user_id: admin,
              role: 'admin',
              profiles: { full_name: 'Técnico de prueba', email: 'admin@example.test' },
            },
          ])
        case 'list_office_visits': {
          const { p_tenant_id, p_from, p_to } = request.postDataJSON()
          assert.equal(p_tenant_id, tenant)
          return json(
            visits.filter(({ scheduled_start_at: start }) => {
              const date = start.slice(0, 10)
              return p_from <= date && date <= p_to
            }),
          )
        }
        case 'list_visit_contract_labels':
          return json([
            {
              visit_id: selected.id,
              contract_id: contract,
              contract_title: 'Mantenimiento semanal',
            },
            { visit_id: future.id, contract_id: contract, contract_title: 'Mantenimiento semanal' },
          ])
        case 'service_visits':
          return json(
            visits.map(({ id, contract_occurrence_on }) => ({
              id,
              contract_occurrence_on,
              work_team_id: null,
              route_order: 0,
            })),
          )
        case 'replan_service_visit_local': {
          const payload = request.postDataJSON()
          assert.equal(payload.p_tenant_id, tenant)
          assert.equal(payload.p_visit_id, selected.id)
          assert.equal(payload.p_expected_updated_at, `${current}T01:00:00Z`)
          assert.equal(payload.p_local_start, `${moved}T12:30`)
          assert.equal(payload.p_duration_minutes, 45)
          assert.equal(payload.p_assigned_user_id, admin)
          assert.equal(payload.p_reason, 'Cambio del cliente')
          assert.match(payload.p_operation_id, /^[0-9a-f-]{36}$/)
          moveRequests += 1
          selected.scheduled_start_at = `${moved}T11:30:00Z`
          selected.scheduled_end_at = `${moved}T12:15:00Z`
          selected.updated_at = `${moved}T02:00:00Z`
          return json(selected.id)
        }
        case 'transition_service_visit': {
          const payload = request.postDataJSON()
          assert.equal(payload.p_tenant_id, tenant)
          assert.equal(payload.p_visit_id, selected.id)
          assert.equal(payload.p_expected_updated_at, `${moved}T02:00:00Z`)
          assert.equal(payload.p_reason, 'Cierre puntual')
          assert.equal(payload.p_next_status, 'skipped')
          assert.match(payload.p_operation_id, /^[0-9a-f-]{36}$/)
          skipRequests.push(payload)
          if (recordedSkips.has(payload.p_operation_id)) return json('skipped')
          recordedSkips.add(payload.p_operation_id)
          selected.status = 'skipped'
          return json({ message: 'Respuesta perdida. Reintenta.' }, 503)
        }
        default:
          return json([])
      }
    })

    const page = await context.newPage()
    await page.goto(`${origin}/trabajos?view=list&period=week&date=${current}`)
    const row = (title) =>
      page.locator('ol > li').filter({ has: page.getByText(title, { exact: true }) })
    const occurrence = row('Visita de origen')
    await occurrence.getByRole('button', { name: 'Mover esta visita' }).press('Enter')
    await occurrence.getByText('Alcance: solo esta visita').waitFor()
    await occurrence.getByText('Contrato: Mantenimiento semanal').waitFor()
    assert.equal(
      await row('Visita puntual').getByRole('button', { name: 'Omitir esta visita' }).count(),
      0,
    )
    assert.equal(moveRequests, 0)
    await occurrence.getByLabel('Nuevo inicio local').fill(`${moved}T12:30`)
    await occurrence.getByLabel('Duración en minutos').fill('45')
    await occurrence.getByText('Nuevo inicio: 5 nov 2026, 12:30 · 45 min').waitFor()
    await occurrence.getByLabel('Motivo del cambio').fill('Cambio del cliente')
    await occurrence.getByRole('button', { name: 'Mover solo esta visita' }).press('Enter')
    await occurrence.getByText(/12:30/).waitFor()
    assert.equal(moveRequests, 1)
    await page.reload()
    const skip = occurrence.getByRole('button', { name: 'Omitir esta visita' })
    await skip.press('Enter')
    const confirm = occurrence.getByRole('region', { name: 'Omitir «Visita de origen»' })
    await confirm.getByRole('heading').waitFor()
    assert.equal(
      await confirm.getByRole('heading').evaluate((el) => el === document.activeElement),
      true,
    )
    await confirm.getByText('Fecha original de la serie: 4 nov 2026').waitFor()
    await confirm.getByText(/Programada ahora: 5 nov 2026, 12:30/).waitFor()
    assert.equal(
      await confirm.getByRole('button', { name: 'Confirmar omisión' }).isDisabled(),
      true,
    )
    await confirm.getByRole('button', { name: 'Volver sin omitir' }).press('Enter')
    assert.equal(await skip.evaluate((el) => el === document.activeElement), true)
    assert.equal(skipRequests.length, 0)
    await skip.press('Enter')
    await confirm.getByLabel('Motivo de la omisión').fill('Cierre puntual')
    await confirm.getByRole('button', { name: 'Confirmar omisión' }).press('Enter')
    await confirm
      .getByRole('alert')
      .getByText(/Respuesta perdida/)
      .waitFor()
    assert.equal(skipRequests.length, 1)
    await confirm.getByRole('button', { name: 'Confirmar omisión' }).press('Enter')
    await occurrence.getByText(/Orden 0 · Omitida/).waitFor()
    await page.reload()
    await occurrence.getByText(/Orden 0 · Omitida/).waitFor()
    await row('Visita siguiente')
      .getByText(/Orden 0 · Planificada/)
      .waitFor()
    assert.equal(skipRequests.length, 2)
    assert.deepEqual(skipRequests[0], skipRequests[1])
    assert.equal(recordedSkips.size, 1)
    assert.deepEqual(future, futureBefore)
    assert.equal(selected.contract_occurrence_on, current)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    )
    process.stdout.write(
      'Visit occurrence at 320px: preview, keyboard, original date, reopen, idempotent skip and future preservation.\n',
    )
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
