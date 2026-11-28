// VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture for the build.
// Run Vite preview on 4211 and PLAYWRIGHT_MODULE/CHROMIUM_PATH for this check.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:4211'
const supabase = 'http://localhost:54399'
const id = (n) => `ab740000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = id(1)
const visitId = id(2)
const parameterId = id(4)
const user = {
  id: id(3),
  email: 'worker@example.test',
  user_metadata: {},
  app_metadata: {},
  aud: 'authenticated',
}
const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date())
const version = `${day}T01:00:00.123456Z`
const priorDay = '2026-11-21T10:00:00+00:00'
const visit = {
  id: visitId,
  title: 'Mantenimiento ficticio',
  client_name: 'Cliente ficticio',
  location_name: 'Centro ficticio',
  address: '',
  notes: '',
  scheduled_start_at: `${day}T08:00:00Z`,
  scheduled_end_at: `${day}T10:00:00Z`,
  timezone: 'Europe/Madrid',
  updated_at: version,
  status: 'in_progress',
}
const exp = Math.floor(Date.now() / 1000) + 3_600
const token = Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url')

async function run() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  const writes = []
  const initial = { id: parameterId, label: 'pH', unit: 'pH', version }
  let current = initial
  let readFailure = true
  let lostResponse = true
  let supported = true
  let recorded = false
  try {
    const context = await browser.newContext({
      viewport: { width: 320, height: 680 },
      timezoneId: 'Europe/Madrid',
      serviceWorkers: 'block',
    })
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
        return send([{ tenant_id: tenant, company_name: 'Empresa ficticia', role: 'user' }])
      if (name === 'company_onboarding_status') return send(null)
      if (name === 'is_platform_superadmin') return send(false)
      if (name === 'tenant_can_write') return send(true)
      if (name === 'auth' || name === 'user') return send(user)
      if (name === 'my_assigned_visits') return send([visit])
      if (name === 'service_visit_reports')
        return send({
          visit_id: visitId,
          tenant_id: tenant,
          revision: 1,
          updated_at: version,
          updated_by: user.id,
          data: { notes: '', recommendations: '', checklist: [], next_actions: '' },
        })
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
        assert.deepEqual(request.postDataJSON(), { p_tenant_id: tenant, p_visit_id: visitId })
        if (readFailure) {
          readFailure = false
          return send({ message: 'Fixture failure' }, 503)
        }
        return send({
          supported,
          parameters: supported ? [current] : [],
          readings:
            recorded && supported
              ? [
                  {
                    id: id(7),
                    value: 7.2,
                    unit: 'pH',
                    label: 'pH',
                    method: 'Sonda digital',
                    measured_at: `${day}T10:00:00Z`,
                    previous: { value: 7.53, unit: 'pH', measured_at: priorDay },
                  },
                ]
              : [],
        })
      }
      if (name === 'record_visit_measurement_with_unit') {
        const body = request.postDataJSON()
        writes.push(body)
        assert.equal(body.p_tenant_id, tenant)
        assert.equal(body.p_visit_id, visitId)
        assert.equal(body.p_parameter_id, parameterId)
        assert.equal(body.p_expected_unit, 'pH')
        assert.equal(body.p_parameter_version, version)
        assert.equal(body.p_method, 'Sonda digital')
        assert.match(body.p_operation_id, /^[0-9a-z-]{36}$/)
        if (body.p_value === 7.3) {
          current = { ...initial, unit: 'unidad nueva', version: `${day}T02:00:00Z` }
          return send(
            {
              code: 'P0409',
              message:
                'Cambió el parámetro o su unidad. Actualiza y revisa el valor antes de guardar.',
            },
            409,
          )
        }
        assert.equal(body.p_value, 7.2)
        recorded = true
        if (lostResponse) {
          lostResponse = false
          return send({ message: 'Fixture lost reply' }, 503)
        }
        return send(id(7))
      }
      return send([])
    })

    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    await page.goto(`${origin}/mi-jornada`)
    await page.getByRole('button', { name: 'Abrir parte' }).press('Enter')
    const panel = page.getByRole('region', { name: 'Mediciones', exact: true })
    await page.getByRole('button', { name: 'Reintentar mediciones' }).press('Enter')
    await panel.getByText('No hay mediciones registradas en esta visita.').waitFor()
    await panel.getByLabel('Parámetro').selectOption(parameterId)
    await panel.getByLabel('Método de medición').fill('Sonda digital')
    await panel.getByLabel('Valor (pH)').fill('7,2001')
    assert.equal(await panel.getByRole('button', { name: 'Registrar medición' }).isDisabled(), true)
    await panel.getByLabel('Valor (pH)').fill('7,2')
    await context.setOffline(true)
    await panel.getByText(/Sin conexión. El valor no se guarda como borrador/).waitFor()
    assert.equal(await panel.getByRole('button', { name: 'Registrar medición' }).isDisabled(), true)
    assert.equal(await panel.getByLabel('Valor (pH)').inputValue(), '7,2')
    assert.equal(writes.length, 0)
    await context.setOffline(false)
    await panel
      .getByRole('button', { name: 'Registrar medición' })
      .and(panel.locator('button:not([disabled])'))
      .waitFor()
    await panel.getByRole('button', { name: 'Registrar medición' }).press('Enter')
    await panel
      .getByRole('alert')
      .getByText(/No se pudo confirmar/)
      .waitFor()
    await panel.getByRole('button', { name: 'Reintentar medición' }).press('Enter')
    await panel.getByText('Medición registrada.', { exact: true }).waitFor()
    assert.deepEqual(writes[0], writes[1])
    await panel.getByText('Lectura anterior comparable: 7,53 pH').waitFor()
    assert.equal(await panel.locator(`time[datetime="${priorDay}"]`).count(), 1)
    await panel.getByLabel('Valor (pH)').fill('7,3')
    await panel.getByRole('button', { name: 'Registrar medición' }).press('Enter')
    await panel
      .getByRole('alert')
      .getByText(/Cambió la configuración/)
      .waitFor()
    assert.equal(
      await panel.getByRole('button', { name: 'Reintentar medición' }).isDisabled(),
      true,
    )
    await panel.getByRole('button', { name: 'Revisar parámetro' }).press('Enter')
    assert.equal(await panel.getByLabel('Valor (unidad nueva)').inputValue(), '')
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    )
    assert.equal(writes.length, 3)
    supported = false
    await page.reload()
    const unsupportedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/visit_measurement_context') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Abrir parte' }).press('Enter')
    assert.equal((await (await unsupportedResponse).json()).supported, false)
    assert.equal(await panel.count(), 0)
    process.stdout.write(
      'Visit measurements at 320px: exact units, comparable date, retry payload, changed configuration, and silent non-pool case.\n',
    )
  } finally {
    await browser.close()
  }
}
run().catch((error) => {
  process.stderr.write(`${error?.stack ?? String(error)}\n`)
  process.exitCode = 1
})
