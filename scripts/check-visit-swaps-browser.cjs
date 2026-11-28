// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Run against Vite preview port 4208 with PLAYWRIGHT_MODULE and CHROMIUM_PATH.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:4208'
const supabase = 'http://localhost:54399'
const makeId = (n) => `ab660000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [tenant, worker, admin, ownId, otherId] = Array.from({ length: 5 }, (_, i) => makeId(i + 1))
const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(
  new Date(Date.now() + 86_400_000),
)
const ownStart = `${day}T08:00:00Z`
const ownEnd = `${day}T09:00:00Z`
const otherStart = `${day}T10:00:00Z`
const otherEnd = `${day}T11:00:00Z`
const stamp = '2026-11-28T02:30:00.123456+00:00'
const options = [
  { id: otherId, version: stamp, start_at: otherStart, end_at: otherEnd, colleague: 'Técnica B' },
]
const own = {
  id: ownId,
  title: 'Visita propia',
  scheduled_start_at: ownStart,
  scheduled_end_at: ownEnd,
  status: 'scheduled',
  priority: 'normal',
  timezone: 'Europe/Madrid',
  updated_at: stamp,
  address: '',
  notes: '',
  work_team_id: null,
  client_name: 'Mi cliente',
}

async function run() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  const writes = []
  let proposal
  let optionsError = true
  let createError = true
  let approveError = true
  async function session(id, role) {
    const context = await browser.newContext({
      viewport: { width: 320, height: 680 },
      timezoneId: 'Europe/Madrid',
      serviceWorkers: 'block',
    })
    const user = {
      id,
      email: `${role}@example.test`,
      user_metadata: {},
      app_metadata: {},
      aud: 'authenticated',
    }
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = Buffer.from(JSON.stringify({ sub: id, exp })).toString('base64url')
    await context.addInitScript(
      (stored) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(stored)),
      {
        user,
        expires_at: exp,
        access_token: `eyJhbGciOiJIUzI1NiJ9.${token}.fixture`,
        refresh_token: 'fixture',
      },
    )
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== supabase) return route.abort()
      const respond = (json, status = 200) =>
        route.fulfill({
          json,
          status,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': '*',
          },
        })
      if (request.method() === 'OPTIONS') return respond(null)
      switch (url.pathname.split('/').at(-1)) {
        case 'my_company_memberships':
          return respond([{ tenant_id: tenant, company_name: 'Empresa ficticia', role }])
        case 'company_onboarding_status':
        case 'is_platform_superadmin':
          return respond(null)
        case 'tenant_can_write':
        case 'can_use_staff':
          return respond(true)
        case 'tenants':
          return respond([{ id: tenant, name: 'Empresa ficticia' }])
        case 'user':
          return respond(user)
        case 'my_assigned_visits':
          return respond([own])
        case 'service_visits':
          return respond([{ id: ownId, work_team_id: null, route_order: 0 }])
        case 'list_visit_swap_options':
          assert.equal(role, 'user')
          assert.deepEqual(request.postDataJSON(), {
            p_tenant_id: tenant,
            p_own_id: ownId,
            p_day: day,
          })
          if (optionsError) {
            optionsError = false
            return respond({ message: 'Fixture timeout' }, 503)
          }
          return respond(options)
        case 'create_visit_swap_proposal': {
          assert.equal(role, 'user')
          const body = request.postDataJSON()
          writes.push(body)
          assert.match(body.p_id, /^[0-9a-f-]{36}$/)
          assert.deepEqual(body, {
            p_tenant_id: tenant,
            p_id: body.p_id,
            p_own_id: ownId,
            p_own_version: stamp,
            p_other_id: otherId,
            p_other_version: stamp,
          })
          proposal = {
            id: body.p_id,
            created_at: stamp,
            decided_at: null,
            state: 'pending',
            requester: 'Técnico A',
            colleague: 'Técnica B',
            own_title: own.title,
            other_title: 'Cliente que ve solo coordinación',
            own_start: ownStart,
            own_end: ownEnd,
            other_start: otherStart,
            other_end: otherEnd,
            stale: false,
          }
          if (createError) {
            createError = false
            return respond({ message: 'Fixture returns network error after storing' }, 503)
          }
          return respond('pending')
        }
        case 'list_visit_swap_proposals':
          assert.deepEqual(request.postDataJSON(), { p_tenant_id: tenant })
          if (!proposal) return respond([])
          return respond([
            role === 'admin' ? proposal : { ...proposal, other_title: null, requester: null },
          ])
        case 'decide_visit_swap_proposal': {
          assert.equal(role, 'admin')
          const body = request.postDataJSON()
          writes.push(body)
          assert.deepEqual(body, {
            p_tenant_id: tenant,
            p_id: proposal.id,
            p_created_at: stamp,
            p_decision: 'approved',
          })
          if (approveError) {
            approveError = false
            return respond({ code: 'P0409', message: 'No hay cobertura para ambos horarios.' }, 409)
          }
          proposal.state = 'approved'
          return respond('approved')
        }
        default:
          return respond([])
      }
    })
    return context.newPage()
  }
  try {
    const page = await session(worker, 'user')
    await page.goto(`${origin}/mi-jornada`)
    await page.getByRole('button', { name: 'Intercambiar visitas' }).press('Enter')
    await page.getByRole('button', { name: 'Proponer intercambio' }).press('Enter')
    const newDialog = page.getByRole('dialog', { name: 'Proponer intercambio de visitas' })
    await newDialog
      .getByLabel('Mi visita')
      .locator(`option[value="${ownId}"]`)
      .waitFor({ state: 'attached' })
    await newDialog.getByLabel('Día de la otra visita').waitFor()
    await newDialog.getByLabel('Mi visita').selectOption(ownId)
    await newDialog.getByLabel('Día de la otra visita').fill(day)
    await newDialog.getByRole('button', { name: 'Reintentar alternativas' }).press('Enter')
    await newDialog.getByLabel('Visita alternativa').selectOption(otherId)
    await newDialog.getByText('Si coordinación aprueba').waitFor()
    await newDialog.getByText(/Tú harás la visita alternativa/).waitFor()
    assert.equal(await page.getByText('Cliente que ve solo coordinación').count(), 0)
    assert.equal(writes.length, 0)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    )
    await newDialog.getByRole('button', { name: 'Registrar propuesta' }).press('Enter')
    await newDialog
      .getByRole('alert')
      .getByText(/No se pudo confirmar/)
      .waitFor()
    await newDialog.getByRole('button', { name: 'Reintentar propuesta' }).press('Enter')
    await page.getByText('Propuesta registrada. Aún no cambió ninguna visita.').waitFor()
    await page.getByText('Pendiente de coordinación').waitFor()
    assert.deepEqual(writes[0], writes[1])
    const office = await session(admin, 'admin')
    await office.goto(`${origin}/trabajos`)
    await office.getByRole('button', { name: 'Propuestas de intercambio' }).press('Enter')
    await office.getByRole('button', { name: 'Revisar aprobación' }).press('Enter')
    const review = office.getByRole('dialog', { name: 'Aprobar intercambio' })
    await review.getByText('Cliente que ve solo coordinación').waitFor()
    await review.getByText('Propuesto: Técnico A').waitFor()
    assert.equal(writes.length, 2)
    assert.equal(
      await office.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    )
    await review.getByRole('button', { name: 'Aprobar intercambio' }).press('Enter')
    await review.getByRole('alert').getByText('No hay cobertura para ambos horarios.').waitFor()
    await review.getByRole('button', { name: 'Aprobar intercambio' }).press('Enter')
    await office.getByText('Intercambio aplicado a las dos visitas.').waitFor()
    assert.deepEqual(writes[2], writes[3])
    await page.reload()
    await page.getByRole('button', { name: 'Intercambiar visitas' }).press('Enter')
    await page.getByText('Aprobado', { exact: true }).waitFor()
    assert.equal(await page.getByText('Cliente que ve solo coordinación').count(), 0)
    process.stdout.write(
      'Visit exchange at 320px: scoped preview, technician retry, office review and retries, final acknowledgement.\n',
    )
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? String(error)}\n`)
  process.exitCode = 1
})
