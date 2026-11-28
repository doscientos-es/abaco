// Requires a local Vite server using the synthetic Supabase URL, never a hosted project:
// VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture pnpm exec vite --port 4198
// PLAYWRIGHT_MODULE=playwright [CHROMIUM_PATH=/path/to/chromium] node scripts/check-visit-handoffs-browser.cjs
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:4198'
const fakeSupabase = 'http://localhost:54399'
const id = (n) => `78000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const tenant = id(1)
const sourceId = id(20)
const targetId = id(21)
const itemId = id(28)
const user = {
  id: id(2),
  email: 'tecnica@example.test',
  user_metadata: { full_name: 'Técnica de prueba' },
  app_metadata: { provider: 'email' },
  aud: 'authenticated',
}
const expires = Math.floor(Date.now() / 1000) + 3600
const session = {
  access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString('base64url')}.fixture`,
  refresh_token: 'fixture',
  expires_at: expires,
  expires_in: 3600,
  user,
}
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date())
const source = {
  id: sourceId,
  title: 'Primera visita',
  client_name: 'Cliente ficticio',
  location_name: 'Centro ficticio',
  address: 'Calle ficticia 15',
  scheduled_start_at: `${today}T08:00:00Z`,
  scheduled_end_at: `${today}T09:00:00Z`,
  timezone: 'Europe/Madrid',
  updated_at: `${today}T07:00:00Z`,
  status: 'in_progress',
}
const target = {
  ...source,
  id: targetId,
  title: 'Segunda visita',
  scheduled_start_at: `${today}T10:00:00Z`,
  scheduled_end_at: `${today}T11:00:00Z`,
  status: 'scheduled',
}
const task = 'Revisar la presión de la bomba antes del arranque'

async function run() {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    ...(process.env.CHROMIUM_RESTRICTED === '1'
      ? { args: ['--no-zygote', '--single-process', '--disable-gpu'] }
      : {}),
  })
  try {
    const context = await browser.newContext({
      viewport: { width: 320, height: 700 },
      permissions: ['geolocation'],
      geolocation: { latitude: 41.35, longitude: 2.1 },
      serviceWorkers: 'block',
    })
    await context.addInitScript(
      (fixture) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(fixture)),
      session,
    )
    const createOps = []
    let resolveCount = 0
    let item = null
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== fakeSupabase) return route.abort()
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
      const name = url.pathname.split('/').at(-1)
      if (name === 'my_company_memberships')
        return json([{ tenant_id: tenant, company_name: 'Empresa de pruebas', role: 'user' }])
      if (name === 'company_onboarding_status') return json(null)
      if (name === 'tenant_can_write') return json(true)
      if (name === 'is_platform_superadmin') return json(false)
      if (name === 'my_assigned_visits') {
        const args = request.postDataJSON()
        return json(args.p_from <= today && today <= args.p_to ? [source, target] : [])
      }
      if (name === 'service_visit_reports') return json(null)
      if (name === 'service_visit_report_versions') return json(null)
      if (name === 'list_service_visit_handoffs') {
        const args = request.postDataJSON()
        assert.equal(args.p_tenant_id, tenant)
        const visit = args.p_visit_id === sourceId ? source : target
        assert.equal(args.p_visit_id, visit.id)
        return json({
          can_create: visit.status !== 'completed',
          has_scope: true,
          can_resolve: visit.status === 'in_progress',
          incoming: visit === target && source.status === 'completed' && item ? [item] : [],
          incoming_has_more: false,
          outgoing: visit === source && item ? [item] : [],
        })
      }
      if (name === 'create_service_visit_handoff') {
        const args = request.postDataJSON()
        assert.equal(args.p_tenant_id, tenant)
        assert.equal(args.p_source_visit_id, sourceId)
        assert.equal(args.p_title, task)
        assert.deepEqual(Object.keys(args).sort(), [
          'p_operation_id',
          'p_source_visit_id',
          'p_tenant_id',
          'p_title',
        ])
        createOps.push(args.p_operation_id)
        item ??= { id: itemId, title: task, status: 'pending' }
        if (createOps.length === 1) return json({ message: 'Respuesta perdida' }, 503)
        return json(itemId)
      }
      if (name === 'resolve_service_visit_handoff') {
        const args = request.postDataJSON()
        assert.equal(args.p_handoff_id, itemId)
        assert.equal(args.p_visit_id, targetId)
        assert.equal(args.p_tenant_id, tenant)
        assert.equal(target.status, 'in_progress')
        assert.equal(++resolveCount, 1)
        item.status = 'resolved'
        return json(itemId)
      }
      if (name === 'transition_service_visit') {
        const args = request.postDataJSON()
        const visit = args.p_visit_id === sourceId ? source : target
        assert.equal(args.p_visit_id, visit.id)
        visit.status = args.p_next_status
        visit.updated_at = `${today}T0${visit.id === sourceId ? '8' : '9'}:10:00Z`
        return json(null)
      }
      return json([])
    })

    const page = await context.newPage()
    await page.clock.setFixedTime(new Date(`${today}T08:30:00Z`))
    await page.goto(`${origin}/mi-jornada`)
    const first = page.getByRole('article').filter({ hasText: source.title })
    await first.getByRole('button', { name: 'Abrir parte' }).press('Enter')
    const outgoing = first.getByRole('region', { name: 'Pendientes entre visitas' })
    const createInput = outgoing.getByRole('textbox', { name: /Dejar un pendiente/ })
    await createInput.fill(task)
    await createInput.press('Enter')
    await outgoing
      .getByRole('alert')
      .filter({ hasText: 'No se pudo confirmar el cambio' })
      .waitFor()
    await outgoing.getByText(task, { exact: true }).waitFor()
    await createInput.press('Enter')
    await outgoing.getByRole('status').filter({ hasText: 'Pendiente guardado.' }).waitFor()
    assert.equal(createOps.length, 2)
    assert.equal(createOps[0], createOps[1])

    const second = page.getByRole('article').filter({ hasText: target.title })
    await second.getByRole('button', { name: 'Abrir parte' }).press('Enter')
    const incoming = second.getByRole('region', { name: 'Pendientes entre visitas' })
    await incoming.getByRole('textbox').waitFor()
    assert.equal(await incoming.getByText(task, { exact: true }).count(), 0)
    await first.getByRole('button', { name: 'Completar visita' }).press('Enter')
    await first.getByRole('button', { name: 'Ver parte' }).waitFor()
    const start = second.getByRole('button', { name: 'Iniciar visita' })
    await start.and(page.locator(':enabled')).waitFor()
    await start.press('Enter')
    await incoming.getByText(task, { exact: true }).waitFor()
    const targetInput = incoming.getByRole('textbox', { name: /Dejar un pendiente/ })
    await targetInput.fill(task.toUpperCase())
    await targetInput.press('Enter')
    await incoming.getByRole('alert').filter({ hasText: 'Ese pendiente ya está aquí.' }).waitFor()
    assert.equal(createOps.length, 2)
    const action = incoming.getByRole('button', { name: `Marcar como resuelto: ${task}` })
    assert.ok((await action.boundingBox()).height >= 44)
    await action.press('Enter')
    await incoming.getByText('Resuelto', { exact: true }).waitFor()
    assert.equal(await action.count(), 0)
    assert.equal(resolveCount, 1)
    const layout = await page.locator('#main-content').evaluate((element) => ({
      viewport: element.clientWidth,
      content: element.scrollWidth,
    }))
    assert.ok(layout.content <= layout.viewport + 1, JSON.stringify(layout))
    process.stdout.write(
      'DEV-78: 320 px, keyboard creation/retry, distinct visited target and resolution verified.\n',
    )
  } finally {
    await browser.close()
  }
}

void run().catch((error) => {
  process.stderr.write(`${error?.stack ?? String(error)}\n`)
  process.exitCode = 1
})
