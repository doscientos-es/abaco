// Fixture build uses VITE_SUPABASE_URL=http://localhost:54399 and VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Run Vite preview on port 4212 and set PLAYWRIGHT_MODULE/CHROMIUM_PATH for the browser.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:4212'
const supabase = 'http://localhost:54399'
const id = (n) => `ab741000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = id(1),
  visitId = id(2),
  worker = id(3),
  admin = id(4)
const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date())
const version = `${day}T01:00:00.123456Z`
const visit = {
  id: visitId,
  title: 'Inspección de activo',
  client_name: 'Cliente ficticio',
  location_name: 'Centro',
  address: '',
  notes: '',
  timezone: 'Europe/Madrid',
  status: 'in_progress',
  priority: 'normal',
  scheduled_start_at: `${day}T08:00:00Z`,
  scheduled_end_at: `${day}T10:00:00Z`,
  updated_at: version,
  assigned_user_id: worker,
}

async function run() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  const configOperations = []
  const writes = []
  let parameter
  let persisted
  let reportVisit = visit
  function isScoped(body) {
    assert.equal(body.p_tenant_id, tenant)
    assert.equal(body.p_visit_id, visitId)
  }
  async function newPage(role, userId) {
    const context = await browser.newContext({
      viewport: { width: 320, height: 680 },
      serviceWorkers: 'block',
    })
    const user = {
      id: userId,
      email: `${role}@example.test`,
      user_metadata: {},
      app_metadata: {},
      aud: 'authenticated',
    }
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = Buffer.from(JSON.stringify({ sub: userId, exp })).toString('base64url')
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
        return send([{ tenant_id: tenant, company_name: 'Empresa ficticia', role }])
      if (name === 'tenant_can_write' || name === 'can_use_staff') return send(true)
      if (name === 'user') return send(user)
      if (
        name === 'company_onboarding_status' ||
        name === 'is_platform_superadmin' ||
        name === 'service_visit_reports'
      )
        return send(null)
      if (name === 'tenants') return send([{ id: tenant, name: 'Empresa ficticia' }])
      if (name === 'my_assigned_visits' || name === 'list_office_visits') return send([reportVisit])
      if (name === 'service_visits') {
        if (url.searchParams.get('select')?.startsWith('id,client_id')) {
          return send({ ...reportVisit, client_id: id(10), paper_snapshot: {}, route_order: 0 })
        }
        return send([{ id: visitId, work_team_id: null, route_order: 0 }])
      }
      if (name === 'list_service_visit_handoffs')
        return send({
          can_create: false,
          can_resolve: false,
          has_scope: false,
          incoming: [],
          incoming_has_more: false,
          outgoing: [],
        })
      if (name === 'visit_measurement_context') {
        isScoped(request.postDataJSON())
        return send({
          supported: true,
          mode: 'generic',
          asset_name: 'Montacargas de prueba',
          can_record: reportVisit.status === 'in_progress',
          can_configure: role === 'admin' && reportVisit.status === 'in_progress',
          parameters: parameter ? [parameter] : [],
          readings: persisted ? [persisted] : [],
        })
      }
      if (name === 'configure_generic_visit_measurement') {
        assert.equal(role, 'admin')
        const body = request.postDataJSON()
        isScoped(body)
        assert.match(body.p_id, /^[a-f0-9-]{36}$/)
        configOperations.push(body)
        assert.deepEqual(Object.keys(body).sort(), [
          'p_id',
          'p_label',
          'p_method',
          'p_tenant_id',
          'p_unit',
          'p_visit_id',
        ])
        parameter = {
          id: body.p_id,
          version,
          label: body.p_label,
          unit: body.p_unit,
          method: body.p_method,
        }
        if (configOperations.length === 1) return send({ message: 'Fixture lost reply' }, 503)
        return send(parameter.id)
      }
      if (name === 'record_visit_measurement_with_unit') {
        assert.equal(role, 'user')
        const body = request.postDataJSON()
        isScoped(body)
        writes.push(body)
        assert.equal(body.p_parameter_id, parameter.id)
        assert.equal(body.p_expected_unit, 'bar')
        assert.equal(body.p_parameter_version, version)
        assert.equal(body.p_method, 'Manómetro calibrado')
        assert.equal(body.p_value, 3.1)
        persisted = {
          id: id(11),
          label: parameter.label,
          unit: parameter.unit,
          method: parameter.method,
          value: body.p_value,
          measured_at: body.p_measured_at,
          previous: { unit: 'bar', value: 3.2, measured_at: '2026-11-21T10:00:00Z' },
        }
        return send(persisted.id)
      }
      return send([])
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    return page
  }
  try {
    const office = await newPage('admin', admin)
    await office.goto(`${origin}/trabajos?view=list&period=day&date=${day}`)
    await office.getByRole('button', { name: 'Ver parte', exact: true }).press('Enter')
    const setup = office.getByRole('region', { name: 'Mediciones', exact: true })
    await setup.getByText('Activo: Montacargas de prueba').waitFor()
    await setup.getByText('Configurar qué medir en este activo', { exact: true }).press('Enter')
    await setup.getByLabel('Nombre del parámetro').fill('Presión en carga')
    await setup.getByLabel('Unidad', { exact: true }).fill('bar')
    await setup.getByLabel('Método definido').fill('Manómetro calibrado')
    await setup.getByRole('button', { name: 'Crear parámetro' }).press('Enter')
    await setup
      .getByRole('alert')
      .getByText(/No se pudo confirmar/)
      .waitFor()
    await setup.getByRole('button', { name: 'Reintentar parámetro' }).press('Enter')
    await setup.getByText('Parámetro creado para este activo.').waitFor()
    assert.deepEqual(configOperations[0], configOperations[1])
    const page = await newPage('user', worker)
    await page.goto(`${origin}/mi-jornada`)
    await page.getByRole('button', { name: 'Abrir parte', exact: true }).press('Enter')
    const panel = page.getByRole('region', { name: 'Mediciones', exact: true })
    assert.equal(await panel.getByText('Configurar qué medir en este activo').count(), 0)
    await panel.getByLabel('Parámetro').selectOption(parameter.id)
    assert.equal(await panel.getByLabel('Método de medición').inputValue(), 'Manómetro calibrado')
    assert.equal(await panel.getByLabel('Método de medición').getAttribute('readonly'), '')
    await panel.getByLabel('Valor (bar)').fill('3,1')
    await panel.getByRole('button', { name: 'Registrar medición' }).press('Enter')
    await panel.getByText('Lectura anterior comparable: 3,2 bar').waitFor()
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    )
    assert.equal(writes.length, 1)
    reportVisit = { ...visit, status: 'completed' }
    await page.reload()
    await page.getByRole('button', { name: 'Ver parte', exact: true }).press('Enter')
    await panel.getByText('Lectura anterior comparable: 3,2 bar').waitFor()
    assert.equal(await panel.getByRole('button', { name: 'Registrar medición' }).count(), 0)
    process.stdout.write(
      'Generic asset measurements at 320px: admin configuration retry, typed technician reading, exact prior and closed read-only.\n',
    )
  } finally {
    await browser.close()
  }
}
run().catch((error) => {
  process.stderr.write(`${error?.stack ?? String(error)}\n`)
  process.exitCode = 1
})
