// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Vite preview --host 127.0.0.1 --port 4185; then run via PLAYWRIGHT_MODULE.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:4185'
const supabase = 'http://localhost:54399'
const id = (n) => `ab610000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = id(1)
const secondTenant = id(2)
const userId = id(3)
const visit = id(4)
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date())
const draftKey = `abaco:visit-report-draft:v1:${userId}:${tenant}:${visit}`

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
      serviceWorkers: 'block',
    })
    const user = {
      id: userId,
      email: 'worker@example.test',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: { active_company_id: tenant },
    }
    const exp = Math.floor(Date.now() / 1000) + 3600
    const payload = Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url')
    await context.addInitScript(
      (session) => {
        if (!sessionStorage.getItem('offline-fixture-seeded')) {
          sessionStorage.setItem('offline-fixture-seeded', 'yes')
          localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session))
        }
      },
      {
        user,
        access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,
        refresh_token: 'fixture',
        expires_at: exp,
      },
    )

    let disconnected = false
    let refuseAssignment = false
    let serverReport = null
    let receipt = null
    const sends = []
    const deniedControls = []
    await context.route('**/*', async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== supabase || disconnected) return route.abort('internetdisconnected')
      const send = (json, status = 200) =>
        route.fulfill({
          json,
          status,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
            'access-control-allow-headers': '*',
          },
        })
      if (req.method() === 'OPTIONS') return send(null)
      const name = url.pathname.split('/').at(-1)
      if (name === 'user') {
        if (req.method() === 'PUT')
          user.user_metadata.active_company_id = req.postDataJSON().data.active_company_id
        return send(user)
      }
      if (name === 'logout') return send(null)
      if (name === 'my_company_memberships')
        return send([
          { tenant_id: tenant, company_name: 'Primera empresa', role: 'user' },
          { tenant_id: secondTenant, company_name: 'Segunda empresa', role: 'user' },
        ])
      if (name === 'company_onboarding_status' || name === 'service_visit_report_versions')
        return send(null)
      if (name === 'tenant_can_write') return send(true)
      if (name === 'list_service_visit_handoffs')
        return send({
          can_create: false,
          can_resolve: false,
          has_scope: false,
          incoming: [],
          incoming_has_more: false,
          outgoing: [],
        })
      if (name === 'is_platform_superadmin') return send(false)
      if (name === 'my_assigned_visits') {
        const args = req.postDataJSON()
        if (
          refuseAssignment ||
          args.p_tenant_id !== tenant ||
          args.p_from > today ||
          args.p_to < today
        )
          return send([])
        return send([
          {
            id: visit,
            title: 'Inspección sin cobertura',
            client_name: 'Cliente ficticio',
            location_name: 'Centro ficticio',
            address: 'Dirección ficticia',
            status: 'in_progress',
            timezone: 'Europe/Madrid',
            scheduled_start_at: `${today}T08:00:00Z`,
            scheduled_end_at: `${today}T14:00:00Z`,
            updated_at: `${today}T07:00:00Z`,
          },
        ])
      }
      if (name === 'service_visit_reports') {
        assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
        assert.equal(url.searchParams.get('visit_id'), `eq.${visit}`)
        return send(serverReport)
      }
      if (name === 'service_visit_report_writes') {
        assert.equal(url.searchParams.get('actor_id'), `eq.${userId}`)
        assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
        assert.equal(url.searchParams.get('visit_id'), `eq.${visit}`)
        return send(
          receipt && url.searchParams.get('operation_id') === `eq.${receipt.operationId}`
            ? receipt.data
            : null,
        )
      }
      if (name === 'save_service_visit_report') {
        const args = req.postDataJSON()
        assert.equal(args.p_tenant_id, tenant)
        assert.equal(args.p_visit_id, visit)
        assert.equal(args.p_expected_revision, 1)
        sends.push(args)
        const revision = args.p_expected_revision + 1
        serverReport = {
          revision,
          data: args.p_data,
          updated_by: user.id,
          updated_at: `${today}T10:00:00Z`,
          tenant_id: tenant,
          visit_id: visit,
        }
        receipt = {
          operationId: args.p_operation_id,
          data: { expected_revision: args.p_expected_revision, revision, data: args.p_data },
        }
        return send({ message: 'La red perdió la respuesta (fixture)' }, 500)
      }
      if (name === 'transition_service_visit') deniedControls.push(name)
      return send([])
    })

    const page = await context.newPage()
    page.setDefaultTimeout(12_000)
    const setOffline = async (value) => {
      disconnected = value
      await context.setOffline(value)
      await page.waitForFunction((expected) => navigator.onLine === !expected, value)
    }
    const readDraft = () =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), draftKey)
    await page.goto(`${origin}/mi-jornada`)
    const preparation = page.getByRole('region', { name: 'Jornada sin conexión' })
    await preparation.getByText(/Mantén Mi jornada abierta/).waitFor()
    await preparation.getByRole('button', { name: 'Preparar jornada sin conexión' }).click()
    await preparation.getByText('Copia preparada · 1 visita abierta', { exact: true }).waitFor()

    const card = page.getByRole('article', { name: 'Inspección sin cobertura' })
    await setOffline(true)
    assert.equal(await card.getByRole('button', { name: 'Completar visita' }).isDisabled(), true)
    await card.getByRole('button', { name: 'Abrir parte' }).click()
    const note = card.getByRole('textbox', { name: 'Notas del técnico' })
    await note.fill('Trabajo guardado sin conexión')
    await card.getByRole('button', { name: 'Guardar para enviar' }).click()
    await card
      .getByText('Pendiente de enviar · todavía no recibido por la empresa.', { exact: true })
      .waitFor()
    const first = await readDraft()
    assert.equal(first.delivery, 'queued')
    assert.equal(first.baseRevision, 0)
    assert.equal(sends.length, 0)
    await card.getByRole('button', { name: 'Ocultar parte' }).click()
    await card.getByRole('button', { name: 'Abrir parte' }).click()
    assert.equal(await note.inputValue(), first.data.notes)
    assert.equal((await readDraft()).operationId, first.operationId)
    await setOffline(false)
    const sendPending = card.getByRole('button', { name: 'Enviar parte pendiente' })
    await sendPending.waitFor()
    assert.equal(sends.length, 0)
    refuseAssignment = true
    await sendPending.click()
    await card
      .getByText(/No se pudo guardar el parte.*La visita ya no está abierta o asignada/)
      .waitFor()
    assert.equal((await readDraft()).operationId, first.operationId)
    assert.equal(sends.length, 0)
    refuseAssignment = false

    serverReport = {
      tenant_id: tenant,
      visit_id: visit,
      revision: 1,
      data: { notes: 'La oficina guardó otra versión', checklist: [] },
      updated_at: today,
    }
    await sendPending.click()
    await card.getByText('Hay dos versiones del parte', { exact: true }).waitFor()
    assert.equal(sends.length, 0)
    assert.equal((await readDraft()).operationId, first.operationId)
    await card.getByRole('button', { name: 'Seguir con mi borrador tras revisarlo' }).click()
    const reviewed = await readDraft()
    assert.equal(reviewed.baseRevision, 1)
    assert.notEqual(reviewed.operationId, first.operationId)
    assert.equal(reviewed.delivery, 'queued')
    await sendPending.click()
    await card.getByText('Recibido por la empresa · revisión 2', { exact: true }).waitFor()
    assert.equal(sends.length, 1)
    assert.equal(sends[0].p_operation_id, reviewed.operationId)
    assert.equal(await readDraft(), null)

    await setOffline(true)
    assert.equal(await note.inputValue(), reviewed.data.notes)
    await note.fill('Segundo cambio que aún no se envía')
    await card.getByRole('button', { name: 'Guardar para enviar' }).click()
    assert.equal((await readDraft()).baseRevision, 2)
    await preparation.getByRole('button', { name: 'Quitar copia preparada' }).click()
    assert.equal((await readDraft()).delivery, 'queued')
    await setOffline(false)
    await preparation.getByRole('button', { name: 'Preparar jornada sin conexión' }).click()
    await preparation.getByText('Copia preparada · 1 visita abierta', { exact: true }).waitFor()
    const [contentWidth, viewportWidth] = await page
      .locator('#main-content')
      .evaluate((element) => [element.scrollWidth, element.clientWidth])
    assert.ok(contentWidth <= viewportWidth + 1)
    await page.getByRole('link', { name: 'Ajustes', exact: true }).click()
    await page.getByRole('button', { name: 'Cambiar a Segunda empresa' }).click()
    await page.getByRole('button', { name: 'Cambiar a Primera empresa' }).waitFor()
    await page.getByRole('link', { name: 'Mi jornada', exact: true }).click()
    await preparation.getByRole('button', { name: 'Preparar jornada sin conexión' }).waitFor()
    assert.equal(await page.getByText('Segundo cambio que aún no se envía').count(), 0)
    assert.equal(await preparation.getByText(/Copia preparada/).count(), 0)
    assert.equal((await readDraft()).delivery, 'queued')
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('button', { name: 'Menú de usuario' }).click()
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
    await page.waitForURL('**/entrar')
    assert.equal(await readDraft(), null)
    assert.deepEqual(deniedControls, [])
    assert.equal(sends.length, 1)
    process.stdout.write(
      'Worker offline smoke: actual Chromium disconnect/reconnect, bounded preparation, no auto-send, revoked assignment, conflict, exact receipt, tenant isolation and logout purge.\n',
    )
  } finally {
    await browser.close()
  }
}
run().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
})
