// VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture pnpm exec vite --port 4196
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4196'
const fakeSupabase = 'http://localhost:54399'
const uuid = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = uuid(1)
const visitId = uuid(2)
const workerId = uuid(3)
const officeId = uuid(4)
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date())
const visits = [
  {
    id: visitId,
    client_id: uuid(5),
    tenant_id: tenant,
    title: 'Revisión de equipo',
    client_name: 'Cliente Ficticio',
    location_name: 'Centro Ficticio',
    address: 'Calle Ficticia 1',
    timezone: 'Europe/Madrid',
    status: 'scheduled',
    assigned_user_id: workerId,
    assigned_user_name: 'Técnica de prueba',
    scheduled_start_at: `${today}T11:00:00Z`,
    scheduled_end_at: `${today}T12:00:00Z`,
    updated_at: `${today}T09:00:00Z`,
  },
]
const initialLabels = ['Revisar el filtro original', 'Anotar el resultado de la prueba']
const laterLabels = ['Guía nueva que no debe aparecer en el primer parte']

async function run() {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    ...(process.env.CHROMIUM_RESTRICTED === '1'
      ? { args: ['--no-zygote', '--single-process', '--disable-gpu'] }
      : {}),
  })
  let template = null
  let report = null
  const actions = []
  let workerLibraryRequests = 0

  async function pageAs(role) {
    const context = await browser.newContext({
      viewport: { width: 320, height: 740 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    })
    const user = {
      id: role === 'admin' ? officeId : workerId,
      email: `${role}@example.test`,
      aud: 'authenticated',
      user_metadata: {},
      app_metadata: {},
    }
    const expires = Math.floor(Date.now() / 1000) + 3600
    const jwt = Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString('base64url')
    await context.addInitScript(
      (session) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)),
      {
        access_token: `eyJhbGciOiJIUzI1NiJ9.${jwt}.fixture`,
        refresh_token: 'fixture',
        expires_at: expires,
        user,
      },
    )
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== fakeSupabase) return route.abort()
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
        return send([{ tenant_id: tenant, company_name: 'Empresa de pruebas', role }])
      if (name === 'company_onboarding_status') return send(null)
      if (name === 'tenant_can_write') return send(true)
      if (name === 'is_platform_superadmin') return send(false)
      if (name === 'user') return send(user)
      if (name === 'tenants') return send([{ id: tenant, name: 'Empresa de pruebas' }])
      if (name === 'list_office_visits' || name === 'my_assigned_visits') {
        const { p_from: from, p_to: to } = request.postDataJSON()
        return send(from <= today && today <= to ? visits : [])
      }
      if (name === 'service_visit_reports') return send(report)
      if (name === 'service_visits' && url.searchParams.get('select')?.includes('paper_snapshot')) {
        const row = { ...visits[0], paper_snapshot: {} }
        return send(url.searchParams.get('id')?.startsWith('eq.') ? row : [row])
      }
      if (name === 'list_service_visit_handoffs')
        return send({
          can_create: true,
          can_resolve: false,
          has_scope: true,
          incoming: [],
          incoming_has_more: false,
          outgoing: [],
        })
      if (name.includes('visit_report_template')) {
        if (role !== 'admin') {
          workerLibraryRequests++
          return send({ code: '42501' }, 403)
        }
        const payload = request.postDataJSON()
        assert.equal(payload.p_tenant_id, tenant)
        if (name === 'list_visit_report_templates') return send(template ? [template] : [])
        assert.equal(payload.p_service_kind, 'hvac')
        actions.push(name)
        if (name === 'save_visit_report_template_draft') {
          assert.equal(payload.p_expected_revision, template?.draft_revision ?? 0)
          template = {
            ...(template ?? { published_version: null, published_labels: null }),
            service_kind: 'hvac',
            draft_revision: payload.p_expected_revision + 1,
            draft_labels: payload.p_labels,
          }
          return send(template.draft_revision)
        }
        if (name === 'publish_visit_report_template') {
          assert.equal(payload.p_expected_revision, template.draft_revision)
          template = {
            ...template,
            published_version: template.draft_revision,
            published_labels: [...template.draft_labels],
          }
          return send(template.published_version)
        }
        if (name === 'apply_visit_report_template') {
          assert.equal(payload.p_visit_id, visitId)
          assert.equal(payload.p_published_version, template.published_version)
          assert.match(payload.p_operation_id, /^[0-9a-f-]{36}$/)
          assert.equal(report, null)
          report = {
            tenant_id: tenant,
            visit_id: visitId,
            data: {
              notes: '',
              recommendations: '',
              next_actions: '',
              checklist: template.published_labels.map((label, index) => ({
                id: uuid(10 + index),
                label,
                done: false,
              })),
            },
            revision: 1,
            updated_at: `${today}T09:00:00Z`,
            updated_by: officeId,
          }
          return send(1)
        }
      }
      return send([])
    })
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    page.setDefaultNavigationTimeout(45000)
    await page.clock.setFixedTime(new Date(`${today}T10:00:00Z`))
    return page
  }

  async function noHorizontalOverflow(locator) {
    const [scroll, client] = await locator.evaluate((element) => [
      element.scrollWidth,
      element.clientWidth,
    ])
    assert.ok(scroll <= client + 1, `Horizontal overflow: ${scroll}/${client}`)
  }

  try {
    const office = await pageAs('admin')
    async function editTemplate() {
      await office.goto(`${origin}/personalizar?tab=documentos`)
      const summary = office.locator('summary').filter({ hasText: 'Climatización' })
      await summary.press('Enter')
      const form = office.locator('details').filter({ has: summary })
      const input = form.getByRole('textbox', { name: 'Comprobaciones de Climatización' })
      await input.waitFor()
      await noHorizontalOverflow(form)
      return { input, form }
    }
    let { form, input } = await editTemplate()
    await input.fill(initialLabels.join('\n'))
    await input.press('Tab')
    await office.keyboard.press('Enter')
    await form.getByText('Borrador guardado.', { exact: true }).waitFor()
    const works = `${origin}/trabajos?view=list&period=day&date=${today}`
    await office.goto(works)
    await office.getByRole('button', { name: 'Ver parte' }).press('Enter')
    await office.getByRole('button', { name: 'Usar una plantilla de parte' }).press('Enter')
    await office.getByText('Aún no hay plantillas publicadas.').waitFor()
    assert.equal(actions.length, 1)

    ;({ form } = await editTemplate())
    await form.getByRole('button', { name: 'Publicar plantilla' }).press('Enter')
    await form.getByText('Plantilla publicada.', { exact: true }).waitFor()
    await office.goto(works)
    await office.getByRole('button', { name: 'Ver parte' }).press('Enter')
    await office.getByRole('button', { name: 'Usar una plantilla de parte' }).press('Enter')
    const picker = office.getByRole('region', { name: 'Copiar plantilla publicada' })
    const selection = picker.getByRole('button', { name: /Servicio de la plantilla/ })
    await selection.press('Enter')
    await office.getByRole('option', { name: 'Climatización' }).press('Enter')
    await picker.getByText(initialLabels[0], { exact: true }).waitFor()
    await noHorizontalOverflow(picker)
    await picker.getByRole('button', { name: 'Copiar a esta visita' }).press('Enter')
    await picker.waitFor({ state: 'detached' })
    await office.getByText('Plantilla copiada al parte de esta visita.', { exact: true }).waitFor()
    await office
      .getByRole('textbox', { name: `Editar comprobación: ${initialLabels[0]}` })
      .waitFor()
    assert.equal(
      await office
        .getByRole('textbox', { name: `Editar comprobación: ${initialLabels[0]}` })
        .inputValue(),
      initialLabels[0],
    )
    assert.equal(
      await office.getByRole('button', { name: 'Usar una plantilla de parte' }).count(),
      0,
    )

    ;({ form, input } = await editTemplate())
    await input.fill(laterLabels.join('\n'))
    await form.getByRole('button', { name: 'Guardar borrador' }).press('Enter')
    await form.getByText('Borrador guardado.', { exact: true }).waitFor()
    await form.getByRole('button', { name: 'Publicar plantilla' }).press('Enter')
    await form.getByText('Plantilla publicada.', { exact: true }).waitFor()

    const worker = await pageAs('user')
    await worker.goto(`${origin}/mi-jornada`)
    const visit = worker.getByRole('article').filter({ hasText: visits[0].title })
    await visit.getByRole('button', { name: 'Abrir parte' }).press('Enter')
    const actualCheck = visit.getByRole('textbox', {
      name: `Editar comprobación: ${initialLabels[0]}`,
    })
    await actualCheck.waitFor()
    assert.equal(await actualCheck.inputValue(), initialLabels[0])
    assert.equal(
      await visit.getByRole('button', { name: 'Usar una plantilla de parte' }).count(),
      0,
    )
    assert.equal(workerLibraryRequests, 0)
    assert.equal(actions.length, 5)
    process.stdout.write(
      'Report templates: draft, publish, copy, version freeze and assigned worker smoke at 320px passed.\n',
    )
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  process.stderr.write(`${e.stack ?? e}\n`)
  process.exitCode = 1
})
