// Smoke test with only intercepted synthetic data. Run against a local Vite server:
// VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture pnpm exec vite --port 4185
// PLAYWRIGHT_MODULE=/path/to/playwright [CHROMIUM_PATH=/path/to/chromium] node scripts/check-worker-browser.cjs
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4185'
const fakeSupabase = 'http://localhost:54399'
const tenant = '00000000-0000-4000-8000-000000000100'
const user = {
  id: '00000000-0000-4000-8000-000000000200',
  email: 'trabajadora@example.test',
  user_metadata: { full_name: 'Vera Pruebas' },
  app_metadata: { provider: 'email' },
  aud: 'authenticated',
}
const exp = Math.floor(Date.now() / 1000) + 3600
const payload = Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url')
const session = {
  access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,
  refresh_token: 'fixture',
  expires_at: exp,
  user,
}
const dayAt = (offset) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(
    new Date(Date.now() + offset * 86_400_000),
  )
const today = dayAt(0)
const tomorrow = dayAt(1)
const yesterday = dayAt(-1)
const contractId = '00000000-0000-4000-8000-000000000300'
const visitId = '00000000-0000-4000-8000-000000000400'
const completedId = '00000000-0000-4000-8000-000000000401'
const tomorrowId = '00000000-0000-4000-8000-000000000402'
const yesterdayId = '00000000-0000-4000-8000-000000000403'
const unassignedId = '00000000-0000-4000-8000-000000000404'
const visit = {
  id: visitId,
  title: 'Visita al local de pruebas',
  client_name: 'Cliente ficticio',
  location_name: 'Sede ficticia',
  address: 'Calle ficticia 15',
  scheduled_start_at: `${today}T08:00:00Z`,
  scheduled_end_at: `${today}T09:00:00Z`,
  timezone: 'Europe/Madrid',
  updated_at: `${today}T07:00:00Z`,
  status: 'scheduled',
}

async function assertNoHorizontalOverflow(page) {
  const width = await page.locator('#main-content').evaluate((element) => ({
    fit: element.clientWidth,
    full: element.scrollWidth,
    overflow: [...element.querySelectorAll('*')]
      .filter(
        (child) => child.getBoundingClientRect().right > element.getBoundingClientRect().right + 1,
      )
      .slice(0, 15)
      .map((child) => ({
        node: child.tagName,
        classes: child.getAttribute('class'),
        text: child.textContent?.slice(0, 65),
      })),
  }))
  assert.ok(width.full <= width.fit + 1, `Horizontal scroll: ${JSON.stringify(width)}`)
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
      permissions: ['geolocation'],
      geolocation: { latitude: 41.35, longitude: 2.1 },
      serviceWorkers: 'block',
    })
    await context.addInitScript(
      ({ fixture, tenant, yesterday, yesterdayId, unassignedId }) => {
        if (!localStorage.getItem('sb-localhost-auth-token')) {
          localStorage.setItem('sb-localhost-auth-token', JSON.stringify(fixture))
          for (const id of [yesterdayId, unassignedId]) {
            localStorage.setItem(
              `abaco:visit-report-draft:v1:${fixture.user.id}:${tenant}:${id}`,
              JSON.stringify({
                baseRevision: 0,
                data: { notes: 'Borrador de ayer (ficticio).', checklist: [] },
                operationId: 'draft-fixture',
                visitDay: yesterday,
              }),
            )
          }
        }
      },
      { fixture: session, tenant, yesterday, yesterdayId, unassignedId },
    )
    const officeRequests = []
    let createdReport = null
    let visitStatus = 'scheduled'
    let saveAttempts = 0
    let visitStarts = 0
    let calendarFails = false
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
      if (['clients', 'estimates', 'invoices', 'work_orders'].includes(name))
        officeRequests.push(name)
      if (name === 'my_company_memberships')
        return json([{ tenant_id: tenant, company_name: 'Empresa de pruebas', role: 'user' }])
      if (name === 'company_onboarding_status' || name === 'service_visit_report_versions')
        return json(null)
      if (name === 'tenant_can_write') return json(true)
      if (name === 'is_platform_superadmin') return json(false)
      if (name === 'my_assigned_visits') {
        const { p_tenant_id, p_from, p_to } = request.postDataJSON()
        assert.equal(p_tenant_id, tenant)
        if (calendarFails && p_from !== p_to)
          return json({ message: 'Conexión interrumpida (simulación)' }, 500)
        const result = []
        if (p_from <= yesterday && yesterday <= p_to)
          result.push({
            ...visit,
            id: yesterdayId,
            title: 'Visita de ayer',
            scheduled_start_at: `${yesterday}T08:00:00Z`,
            scheduled_end_at: `${yesterday}T09:00:00Z`,
            status: 'in_progress',
          })
        if (p_from <= today && today <= p_to)
          result.push(
            { ...visit, status: visitStatus },
            {
              ...visit,
              id: completedId,
              title: 'Visita ya completada',
              status: 'completed',
              scheduled_start_at: `${today}T10:00:00Z`,
              scheduled_end_at: `${today}T11:00:00Z`,
            },
          )
        if (p_from <= tomorrow && tomorrow <= p_to)
          result.push({
            ...visit,
            id: tomorrowId,
            title: 'Visita del día siguiente',
            scheduled_start_at: `${tomorrow}T08:00:00Z`,
            scheduled_end_at: `${tomorrow}T09:00:00Z`,
          })
        return json(result)
      }
      if (name === 'list_visit_contract_labels')
        return json([
          { visit_id: visitId, contract_id: contractId, contract_title: 'Local ficticio' },
        ])
      if (name === 'service_visit_reports') return json(createdReport)
      if (name === 'save_service_visit_report') {
        const args = request.postDataJSON()
        assert.equal(args.p_tenant_id, tenant)
        assert.equal(args.p_visit_id, visitId)
        assert.equal(args.p_expected_revision, 0)
        assert.equal(args.p_data.notes, 'Revisión ficticia terminada.')
        assert.deepEqual(
          args.p_data.checklist.map(({ label, done }) => ({ label, done })),
          [{ label: 'Comprobar la salida', done: true }],
        )
        if (++saveAttempts === 1) return json({ message: 'Sin conexión (simulación)' }, 500)
        createdReport = { data: args.p_data, revision: 1, visit_id: visitId, tenant_id: tenant }
        return json(1)
      }
      if (name === 'transition_service_visit') {
        const args = request.postDataJSON()
        assert.equal(args.p_tenant_id, tenant)
        assert.equal(args.p_visit_id, visitId)
        assert.equal(args.p_next_status, 'in_progress')
        assert.equal(args.p_start_latitude, 41.35)
        visitStarts += 1
        visitStatus = 'in_progress'
        return json(null)
      }
      return json([])
    })

    const page = await context.newPage()
    await page.clock.setFixedTime(new Date(`${today}T07:45:00Z`))
    await page.goto(`${origin}/mi-jornada`)
    await page.getByRole('heading', { name: 'Visitas del día' }).waitFor()
    await page.getByRole('heading', { name: 'Visita ya completada' }).waitFor()
    const nextVisit = page.getByRole('region', { name: 'Siguiente visita' })
    const maps = nextVisit.getByRole('link', { name: /Cómo llegar a la siguiente visita/ })
    const href = await maps.getAttribute('href')
    assert.equal(new URL(href).searchParams.get('destination'), 'Calle ficticia 15')
    const pending = page.getByRole('region', { name: 'Partes pendientes en este dispositivo' })
    await pending.getByRole('button', { name: 'Continuar parte de Visita de ayer' }).click()
    await page.waitForFunction(
      (id) => document.activeElement?.id === `worker-report-${id}`,
      yesterdayId,
    )
    const oldText = page.getByLabel('Notas del técnico')
    await oldText.waitFor()
    assert.equal(await oldText.inputValue(), 'Borrador de ayer (ficticio).')
    await page.getByRole('button', { name: 'Hoy', exact: true }).click()
    await nextVisit.getByRole('button', { name: 'Ver visita' }).click()
    await page.waitForFunction((id) => document.activeElement?.id === `worker-visit-${id}`, visitId)
    await assertNoHorizontalOverflow(page)
    await page.getByRole('button', { name: 'Calendario', exact: true }).click()
    await page.getByRole('region', { name: 'Agenda de la semana' }).waitFor()
    const weeklyVisit = page.getByRole('button', { name: /Visita al local de pruebas/ })
    await weeklyVisit.waitFor()
    await assertNoHorizontalOverflow(page)
    await weeklyVisit.click()

    const visitCard = page.getByRole('article', { name: 'Visita al local de pruebas' })
    await visitCard.waitFor()
    await page.waitForFunction((id) => document.activeElement?.id === `worker-visit-${id}`, visitId)
    await visitCard.getByRole('button', { name: 'Iniciar visita' }).click()
    await visitCard.getByText('En curso', { exact: true }).waitFor()
    assert.equal(visitStarts, 1)
    await visitCard.getByRole('button', { name: 'Abrir parte' }).click()
    await page.waitForFunction(
      (id) => document.activeElement?.id === `worker-report-${id}`,
      visitId,
    )
    await visitCard.getByLabel('Notas del técnico').fill('Revisión ficticia terminada.')
    const check = visitCard.getByRole('textbox', { name: 'Nueva comprobación' })
    await check.fill('Comprobar la salida')
    await check.press('Enter')
    await visitCard.getByRole('checkbox', { name: 'Completar Comprobar la salida' }).check()
    await visitCard.getByText('1 de 1 hechas', { exact: true }).waitFor()
    await page.reload()
    await pending
      .getByRole('button', { name: 'Continuar parte de Visita al local de pruebas' })
      .click()
    await page.waitForFunction(
      (id) => document.activeElement?.id === `worker-report-${id}`,
      visitId,
    )
    assert.equal(
      await visitCard.getByLabel('Notas del técnico').inputValue(),
      'Revisión ficticia terminada.',
    )
    await visitCard.getByRole('checkbox', { name: 'Completar Comprobar la salida' }).waitFor()
    assert.equal(
      await visitCard.getByRole('checkbox', { name: 'Completar Comprobar la salida' }).isChecked(),
      true,
    )
    const save = visitCard.getByRole('button', { name: 'Guardar parte' })
    await save.click()
    await visitCard.getByText(/No se pudo guardar el parte. Sin conexión/).waitFor()
    await save.click()
    await visitCard.getByText('Guardado en la empresa · revisión 1', { exact: true }).waitFor()
    assert.equal(saveAttempts, 2)
    assert.equal(
      await pending
        .getByRole('button', { name: 'Continuar parte de Visita al local de pruebas' })
        .count(),
      0,
    )
    await page.evaluate(() => {
      const { value: write } = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('abaco:visit-report-draft:v1:'))
          throw new DOMException('Fixture', 'QuotaExceededError')
        return write.call(this, key, value)
      }
    })
    await visitCard.getByLabel('Notas del técnico').fill('Cambio todavía sin guardar')
    await visitCard
      .getByText('El dispositivo no pudo conservar el borrador.', { exact: false })
      .first()
      .waitFor()
    let confirmation = null
    page.once('dialog', async (dialog) => {
      confirmation = dialog.message()
      await dialog.dismiss()
    })
    await page.getByRole('button', { name: 'Día siguiente' }).click()
    assert.match(confirmation, /Salir sin guardarlos/)
    assert.equal(
      await visitCard.getByLabel('Notas del técnico').inputValue(),
      'Cambio todavía sin guardar',
    )
    await visitCard.getByRole('button', { name: 'Descartar cambios locales' }).click()
    assert.equal(
      await visitCard.getByLabel('Notas del técnico').inputValue(),
      'Revisión ficticia terminada.',
    )
    await nextVisit.getByText('Visita del día siguiente', { exact: true }).waitFor()
    await nextVisit.getByRole('button', { name: 'Ver visita' }).click()
    await page.waitForFunction(
      (id) => document.activeElement?.id === `worker-visit-${id}`,
      tomorrowId,
    )
    await page.getByRole('button', { name: 'Hoy', exact: true }).click()
    await assertNoHorizontalOverflow(page)
    await page.getByRole('button', { name: 'Calendario', exact: true }).click()
    await page.getByRole('button', { name: /Visita al local de pruebas.*En curso/ }).waitFor()
    await page.getByRole('button', { name: 'Mes', exact: true }).click()
    await page
      .getByRole('button', { name: /Local ficticio/ })
      .first()
      .waitFor()
    await assertNoHorizontalOverflow(page)
    calendarFails = true
    await page.getByRole('button', { name: 'Periodo siguiente' }).click()
    await page.getByText('No se pudo cargar el calendario', { exact: true }).waitFor()
    calendarFails = false
    await page.getByRole('button', { name: 'Volver a intentarlo' }).click()
    await page.getByText('No tienes trabajos en los días de este calendario.').waitFor()
    await page.setViewportSize({ width: 1280, height: 900 })
    await assertNoHorizontalOverflow(page)
    assert.deepEqual(officeRequests, [])
    process.stdout.write(
      'Worker smoke: 320px + desktop, week/month, exact focus, geolocation, failed save/retry and reload.\n',
    )
  } finally {
    await browser.close()
  }
}

void run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
