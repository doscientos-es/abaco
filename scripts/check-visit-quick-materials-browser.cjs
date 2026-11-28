// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Use Vite preview port 4215 and PLAYWRIGHT_MODULE; request all data from synthetic fixtures.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:4215'
const supabase = 'http://localhost:54399'
const ids = (n) => `ab590000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [tenant, staff, visit, report, gasket, another] = Array.from({ length: 6 }, (_, i) =>
  ids(i + 1),
)
const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date())
const label = 'Inspección de la bomba'
const localKey = `abaco:field-entry-queue:v1:${staff}:${tenant}:${visit}`
const visitFixture = {
  id: visit,
  title: label,
  client_name: 'Cliente ficticio',
  location_name: 'Centro ficticio',
  scheduled_start_at: `${date}T08:00:00Z`,
  scheduled_end_at: `${date}T09:00:00Z`,
  timezone: 'Europe/Madrid',
  updated_at: `${date}T07:00:00Z`,
  status: 'in_progress',
}

async function run() {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    ...(process.env.CHROMIUM_RESTRICTED === '1'
      ? { args: ['--no-zygote', '--single-process', '--disable-gpu'] }
      : {}),
  })
  try {
    const context = await browser.newContext({
      viewport: { width: 320, height: 740 },
      hasTouch: true,
      serviceWorkers: 'block',
    })
    const exp = Math.floor(Date.now() / 1000) + 3600
    const payload = Buffer.from(JSON.stringify({ sub: staff, exp })).toString('base64url')
    const user = {
      id: staff,
      aud: 'authenticated',
      email: 'tecnico@example.test',
      app_metadata: {},
      user_metadata: { full_name: 'Técnico ficticio' },
    }
    await context.addInitScript(
      (session) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)),
      {
        user,
        access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,
        refresh_token: 'fixture',
        expires_at: exp,
      },
    )
    let role = 'user'
    let expectOffline = false
    let failCatalog = false
    let failReview = true
    let failWrite = true
    const calls = []
    const writes = []
    const ledger = []
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== supabase || expectOffline) return route.abort('internetdisconnected')
      const send = (json, status = 200, headers = {}) =>
        route.fulfill({
          json,
          status,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': '*',
            ...headers,
          },
        })
      if (request.method() === 'OPTIONS') return send(null)
      const name = url.pathname.split('/').at(-1)
      calls.push(name)
      if (name === 'user') return send(user)
      if (name === 'my_company_memberships')
        return send([{ tenant_id: tenant, company_name: 'Empresa de pruebas', role }])
      if (name === 'company_onboarding_status' || name === 'service_visit_reports')
        return send(null)
      if (name === 'tenant_can_write' || name === 'can_use_staff') return send(true)
      if (name === 'is_platform_superadmin') return send(false)
      if (name === 'tenants') return send([{ id: tenant, name: 'Empresa de pruebas' }])
      if (name === 'my_assigned_visits') {
        const args = request.postDataJSON()
        return send(args.p_from <= date && date <= args.p_to ? [visitFixture] : [])
      }
      if (name === 'list_service_visit_handoffs')
        return send({
          can_create: true,
          can_resolve: true,
          has_scope: true,
          incoming: [],
          outgoing: [],
        })
      if (name === 'list_service_visit_material_choices') {
        const { p_tenant_id, p_visit_id, p_search } = request.postDataJSON()
        assert.equal(p_tenant_id, tenant)
        assert.equal(p_visit_id, visit)
        if (failCatalog) return send({ message: 'fixture catálogo no disponible' }, 403)
        const choices = [
          { id: gasket, name: 'Junta de prueba', unit: 'ud' },
          { id: another, name: 'Rodillo de prueba', unit: 'ud' },
        ]
        return send(
          choices.filter((item) => item.name.toLowerCase().includes(p_search.toLowerCase())),
        )
      }
      if (name === 'record_service_visit_material' || name === 'record_service_visit_field_entry') {
        const args = request.postDataJSON()
        assert.equal(args.p_tenant_id, tenant)
        assert.equal(args.p_visit_id, visit)
        writes.push({ name, ...args })
        if (failWrite) return send({ message: 'Escritura temporalmente no disponible' }, 400)
        const record = {
          id: ids(100 + ledger.length),
          visit_id: visit,
          work_order_id: null,
          contract_id: null,
          kind: args.p_kind,
          description: args.p_description,
          quantity: args.p_quantity,
          unit: args.p_unit,
          occurred_at: args.p_occurred_at,
          recorded_at: args.p_occurred_at,
          supersedes_id: args.p_supersedes_id,
          office_review_requested: args.p_office_review_requested === true,
        }
        ledger.unshift(record)
        return send(record.id)
      }
      if (name === 'service_visit_field_entries') {
        assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
        assert.equal(url.searchParams.get('visit_id'), `eq.${visit}`)
        if (url.searchParams.get('select') === 'supersedes_id')
          return send(ledger.filter((record) => record.supersedes_id))
        return send(ledger, 200, {
          'content-range': ledger.length ? `0-${ledger.length - 1}/${ledger.length}` : '*/0',
        })
      }
      if (name === 'list_pending_visit_report_reviews')
        return send([
          {
            report_version_id: report,
            visit_id: visit,
            visit_title: label,
            client_name: 'Cliente ficticio',
            version: 2,
            closed_at: `${date}T10:00:00Z`,
          },
        ])
      if (name === 'service_visit_report_versions')
        return send({
          id: report,
          version: 2,
          closed_at: `${date}T10:00:00Z`,
          snapshot: {
            company: { name: 'Empresa ficticia' },
            client: { name: 'Cliente ficticio' },
            visit: { title: label },
            report: { data: { notes: 'Verificado', checklist: [] } },
            tasks: [],
            activities: [],
            incidents: [],
          },
        })
      if (name === 'list_service_visit_materials_for_review') {
        const { p_tenant_id, p_visit_id, p_offset } = request.postDataJSON()
        assert.equal(p_tenant_id, tenant)
        assert.equal(p_visit_id, visit)
        assert.equal(p_offset, 0)
        assert.equal(role, 'owner')
        return failReview
          ? send({ message: 'fixture oficina no disponible' }, 400)
          : send(
              ledger.filter(
                (entry) =>
                  entry.office_review_requested &&
                  !ledger.some((correction) => correction.supersedes_id === entry.id),
              ),
            )
      }
      return send([])
    })

    const page = await context.newPage()
    page.setDefaultTimeout(12_000)
    await page.goto(`${origin}/mi-jornada`)
    const article = page.getByRole('article', { name: label })
    await article.getByRole('button', { name: 'Abrir parte' }).press('Enter')
    const section = article.getByRole('region', { name: 'Actividad de campo' })
    await section.getByRole('button', { name: 'Añadir material rápido' }).press('Enter')
    const quick = section.getByRole('region', { name: 'Material rápido', exact: true })
    const search = quick.getByRole('searchbox', { name: 'Buscar en catálogo' })
    await page.keyboard.press('Tab')
    assert.equal(await search.evaluate((element) => element === document.activeElement), true)
    await search.fill('junta')
    await search.press('Enter')
    const catalog = quick.getByRole('combobox', { name: 'Material habitual' })
    await catalog
      .getByRole('option', { name: 'Junta de prueba · ud' })
      .waitFor({ state: 'attached' })
    assert.equal(await catalog.getByRole('option', { name: 'Rodillo de prueba · ud' }).count(), 0)
    await catalog.selectOption(gasket)
    const name = quick.getByRole('textbox', { name: 'Nombre del material' })
    assert.equal(await name.inputValue(), 'Junta de prueba')
    const quantity = quick.getByRole('textbox', { name: 'Cantidad de material' })
    await quick.getByRole('button', { name: 'Sumar una unidad' }).press('Enter')
    assert.equal(await quantity.inputValue(), '2')
    await quantity.fill('2,125')
    await quick.getByRole('button', { name: 'Sumar una unidad' }).press('Enter')
    assert.equal(await quantity.inputValue(), '3.125')
    const flag = quick.getByRole('checkbox', { name: /Marcar para revisión/ })
    await flag.press('Space')
    assert.equal(await flag.isChecked(), true)
    const register = quick.getByRole('button', { name: 'Registrar material' })
    await register.press('Enter')
    await section.getByText(/Con marca para oficina/).waitFor()
    assert.equal(writes.length, 1)
    const local = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), localKey)
    assert.equal(local[0].operationId, writes[0].p_operation_id)
    assert.equal(local[0].quantity, 3.125)
    assert.equal(local[0].officeReviewRequested, true)

    failWrite = false
    await section.getByRole('button', { name: 'Reintentar', exact: true }).press('Enter')
    await section.getByText(/Visita independiente · Para revisión de oficina/).waitFor()
    assert.equal(writes.length, 2)
    assert.deepEqual(writes[1], writes[0])
    assert.equal(writes[1].p_office_review_requested, true)
    const original = ledger[0].id
    await section.getByRole('button', { name: 'Corregir', exact: true }).press('Enter')
    const edit = section.getByRole('spinbutton', { name: 'Cantidad', exact: true })
    await page.waitForFunction(() => document.activeElement?.type === 'number')
    await edit.fill('4.125')
    await section.getByRole('button', { name: 'Registrar corrección' }).press('Enter')
    await section.getByText(/Corrección · Para revisión de oficina/).waitFor()
    assert.equal(writes[2].p_supersedes_id, original)
    assert.equal(writes[2].p_quantity, 4.125)
    await section.getByText(/Visita independiente · Corregida/).waitFor()

    const size = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ])
    assert.ok(size[0] <= size[1] + 1, `320px viewport overflow: ${size}`)
    failCatalog = true
    await search.fill('no disponible')
    await search.press('Enter')
    await quick
      .getByText('No se pudo abrir el catálogo. Puedes escribir el material abajo.')
      .waitFor()
    await name.fill('Material manual')
    await quantity.fill('0')
    await register.press('Enter')
    await quick.getByRole('alert').filter({ hasText: 'cantidad mayor que cero' }).waitFor()
    assert.equal(writes.length, 3)
    await quantity.fill('2')
    expectOffline = true
    await context.setOffline(true)
    await page.waitForFunction(() => !navigator.onLine)
    await register.press('Enter')
    await section.getByText(/2 ud · Material manual/).waitFor()
    assert.equal(writes.length, 3)
    expectOffline = false
    await context.setOffline(false)
    await page.waitForFunction(() => navigator.onLine)
    assert.equal(writes.length, 3)
    assert.ok(!calls.includes('list_service_visit_materials_for_review'))

    // Same synthetic browser session with office permission; verify the flag is
    // fetched only in the office report detail, and latest correction is seen.
    role = 'owner'
    await page.setViewportSize({ width: 1280, height: 920 })
    await page.goto(`${origin}/trabajos`)
    await page.getByRole('tab', { name: /Partes por revisar/ }).press('Enter')
    const inbox = page.getByRole('region', { name: 'Partes pendientes de revisión' })
    await inbox.getByRole('button', { name: 'Revisar parte', exact: true }).press('Enter')
    const office = inbox.getByRole('region', { name: 'Materiales marcados para oficina' })
    await office.getByText('No se pudieron consultar los materiales marcados.').waitFor()
    failReview = false
    await office.getByRole('button', { name: 'Reintentar materiales' }).press('Enter')
    await office.getByText('Junta de prueba', { exact: true }).waitFor()
    await office.getByText('4,125 ud', { exact: true }).waitFor()
    assert.equal(await office.getByText('3,125 ud', { exact: true }).count(), 0)
    assert.ok(!calls.some((call) => /issue_invoice|stock_movement|charge_extra/.test(call)))
    process.stdout.write(
      'Quick materials smoke passed: 320px and desktop, keyboard, catalog failure, correction, idempotent retry, offline queue and office-only marker.\n',
    )
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  process.stderr.write(String(error.stack || error) + '\n')
  process.exitCode = 1
})
