// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Against the local preview on port 4197: PLAYWRIGHT_MODULE=/path/to/playwright node scripts/check-team-calendar-browser.cjs
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4197'
const supabase = 'http://localhost:54399'
const tenant = '00000000-0000-4000-8000-000000000100'
const admin = '00000000-0000-4000-8000-000000000110'
const ana = '00000000-0000-4000-8000-000000000111'
const bruno = '00000000-0000-4000-8000-000000000112'
const north = '00000000-0000-4000-8000-000000000120'
const starts = '2026-11-23'
const ends = '2026-11-29'
const visitRows = [
  ['direct', '2026-11-24T13:00:00Z', '2026-11-24T15:00:00Z', 'scheduled', ana, null],
  ['team', '2026-11-24T15:00:00Z', '2026-11-24T16:00:00Z', 'scheduled', ana, north],
  ['bruno', '2026-11-23T08:00:00Z', '2026-11-23T09:00:00Z', 'completed', bruno, null],
  ['unassigned', '2026-11-29T22:00:00Z', '2026-11-29T23:30:00Z', 'scheduled', null, null],
  ['missing-team', '2026-11-27T08:00:00Z', '2026-11-27T09:00:00Z', 'scheduled', null, 'missing'],
].map(([id, scheduled_start_at, scheduled_end_at, status, assigned_user_id, work_team_id]) => ({
  id,
  scheduled_start_at,
  scheduled_end_at,
  status,
  assigned_user_id,
  work_team_id,
}))

const memberships = [
  [admin, 'Empresa de pruebas', 'admin'],
  [ana, 'Ana Ficticia', 'user'],
  [bruno, 'Bruno Sin Equipo', 'user'],
].map(([id, full_name, role]) => ({
  user_id: id,
  role,
  profiles: { full_name, email: `${id}@example.test` },
  calendar_color: null,
}))

async function run() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  try {
    const context = await browser.newContext({
      viewport: { width: 320, height: 820 },
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
    const jwt = Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url')
    await context.addInitScript(
      (session) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)),
      {
        user,
        expires_at: exp,
        access_token: `eyJhbGciOiJIUzI1NiJ9.${jwt}.fixture`,
        refresh_token: 'fixture',
      },
    )
    let capacityReads = 0
    let errorOnLoad = true
    let staffPlan = true
    let sessionRole = 'admin'
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
          return json([
            { tenant_id: tenant, company_name: 'Empresa de pruebas', role: sessionRole },
          ])
        case 'company_onboarding_status':
          return json(null)
        case 'tenant_can_write':
          return json(true)
        case 'can_use_staff':
          return json(staffPlan)
        case 'is_platform_superadmin':
          return json(false)
        case 'tenants':
          return json([{ id: tenant, name: 'Empresa de pruebas' }])
        case 'memberships':
          assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
          return json(memberships)
        case 'work_teams':
          assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
          return json([
            {
              id: north,
              name: 'Equipo norte',
              description: '',
              archived_at: null,
              updated_at: starts,
              work_team_members: [{ user_id: ana }],
            },
          ])
        case 'staff_schedules':
          assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
          return json([
            {
              user_id: ana,
              updated_at: starts,
              slots: [
                { weekday: 1, start: 540, end: 780 },
                { weekday: 2, start: 840, end: 1020 },
              ],
            },
            {
              user_id: bruno,
              updated_at: starts,
              slots: [{ weekday: 1, start: 540, end: 780 }],
            },
          ])
        case 'service_visits': {
          capacityReads++
          assert.equal(request.method(), 'GET')
          assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
          assert.equal(url.searchParams.get('status'), 'in.(scheduled,in_progress,completed)')
          assert.equal(
            url.searchParams.get('select'),
            'id,scheduled_start_at,scheduled_end_at,status,assigned_user_id,work_team_id',
          )
          assert.equal(url.searchParams.get('order'), 'id.asc')
          if (errorOnLoad) return json({ message: 'Fixture failure' }, 400)
          const nextWeek =
            url.searchParams.get('scheduled_end_at') === 'gt.2026-11-29T23:00:00.000Z'
          assert.equal(
            url.searchParams.get('scheduled_end_at'),
            nextWeek ? 'gt.2026-11-29T23:00:00.000Z' : 'gt.2026-11-22T23:00:00.000Z',
          )
          assert.deepEqual(
            url.searchParams.getAll('scheduled_start_at'),
            nextWeek
              ? ['lt.2026-12-06T23:00:00.000Z', 'gte.2026-11-29T11:00:00.000Z']
              : ['lt.2026-11-29T23:00:00.000Z', 'gte.2026-11-22T11:00:00.000Z'],
          )
          return json(nextWeek ? [visitRows[3]] : visitRows)
        }
        case 'absence_requests':
          assert.equal(request.method(), 'GET')
          assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
          // The app shell also fetches the existing requests badge, which is separate from this view.
          if (!url.searchParams.get('start_date')) return json([])
          assert.equal(url.searchParams.get('select'), 'requester_id,start_date,end_date,status')
          return json(
            url.searchParams.get('start_date') === `lte.${ends}`
              ? [
                  { requester_id: ana, start_date: starts, end_date: starts, status: 'approved' },
                  { requester_id: bruno, start_date: starts, end_date: starts, status: 'pending' },
                ]
              : [],
          )
        default:
          return json([])
      }
    })

    const page = await context.newPage()
    page.setDefaultTimeout(20_000)
    const assertFits = async () => {
      const { scrollWidth, clientWidth } = await page.locator('html').evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }))
      assert.ok(
        scrollWidth <= clientWidth + 1,
        `Horizontal page overflow: ${scrollWidth}/${clientWidth}`,
      )
    }
    await page.goto(`${origin}/trabajadores?vista=calendario&fecha=${starts}`)
    const calendar = page.getByRole('region', { name: 'Calendario del equipo' })
    await calendar
      .getByText('Ausencia aprobada', { exact: true })
      .filter({ visible: true })
      .waitFor({ timeout: 10_000 })
    await calendar
      .getByText('Previsto: 09:00–13:00', { exact: true })
      .filter({ visible: true })
      .waitFor()
    await calendar
      .getByText('Solicitud pendiente', { exact: true })
      .filter({ visible: true })
      .waitFor()
    await assertFits()
    assert.equal(capacityReads, 0)
    const capacityToggle = calendar.getByText('Capacidad semanal y carga', { exact: true })
    const capacity = calendar.getByRole('region', { name: 'Capacidad semanal' })
    const amount = async (label, value) => {
      await capacity
        .locator('dl > div')
        .filter({ hasText: label })
        .getByText(value, { exact: true })
        .waitFor()
    }
    await capacityToggle.press('Enter')
    await capacity.getByRole('alert').waitFor()
    await calendar
      .getByText('Ausencia aprobada', { exact: true })
      .filter({ visible: true })
      .waitFor()
    errorOnLoad = false
    await capacity.getByRole('button', { name: 'Volver a intentarlo' }).press('Enter')
    await amount('Turnos netos conocidos', '7 h')
    await amount('Horas de visita asignadas', '4 h')
    await capacity.getByText(/1 persona sin horario comprobable/).waitFor()
    await capacity.getByText(/Asignaciones sin verificar/).waitFor()
    await capacity.getByText(/1 h fuera de la carga de las personas/).waitFor()
    await capacity.getByText('Las solicitudes pendientes no reducen los turnos.').waitFor()
    await assertFits()
    await capacityToggle.press('Enter')
    await capacity.waitFor({ state: 'hidden' })

    const dayFilters = calendar.getByRole('group', { name: 'Filtrar personas del día' })
    const panel = calendar.getByText('Equipo, trabajador o fecha', { exact: true })
    assert.equal(await calendar.getByRole('combobox', { name: 'Por equipo' }).isVisible(), false)
    await dayFilters.getByRole('button', { name: 'Con turno 1' }).click()
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor({ state: 'hidden' })
    await calendar.getByRole('link', { name: 'Bruno Sin Equipo' }).waitFor()
    await calendar.getByText('Las solicitudes pendientes no quitan el turno previsto.').waitFor()
    await dayFilters.getByRole('button', { name: 'Ausencias 2' }).click()
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor()
    await calendar.getByRole('link', { name: 'Bruno Sin Equipo' }).waitFor()
    await dayFilters.getByRole('button', { name: 'Sin turno 0' }).click()
    await calendar.getByText('No hay personas con este filtro para el día.').waitFor()
    await calendar.getByRole('button', { name: 'Ver todas' }).click()
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor()
    await calendar.getByRole('button', { name: 'martes, 24 de noviembre' }).click()
    await calendar.getByText('14:00–17:00', { exact: true }).filter({ visible: true }).waitFor()
    await dayFilters.getByRole('button', { name: 'Sin turno 1' }).click()
    await calendar.getByRole('link', { name: 'Bruno Sin Equipo' }).waitFor()
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor({ state: 'hidden' })
    await dayFilters.getByRole('button', { name: 'Todas 3' }).click()
    await panel.click()
    await calendar.getByRole('combobox', { name: 'Por equipo' }).selectOption(north)
    await page.waitForURL((url) => url.searchParams.get('equipo') === north)
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor()
    await calendar.getByRole('link', { name: 'Bruno Sin Equipo' }).waitFor({ state: 'hidden' })
    await capacityToggle.press('Enter')
    await amount('Turnos netos conocidos', '3 h')
    await amount('Horas de visita asignadas', '3 h')
    assert.equal(await capacity.getByText(/Visitas sin asignar:/).count(), 0)
    await page.reload()
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor()
    await panel.click()
    assert.equal(await calendar.getByRole('combobox', { name: 'Por equipo' }).inputValue(), north)
    await calendar.getByRole('combobox', { name: 'Por trabajador' }).selectOption(bruno)
    await page.waitForURL((url) => url.searchParams.get('persona') === bruno)
    assert.equal(new URL(page.url()).searchParams.get('equipo'), null)
    await calendar.getByRole('link', { name: 'Bruno Sin Equipo' }).waitFor()
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor({ state: 'hidden' })
    await capacityToggle.press('Enter')
    await amount('Turnos netos conocidos', '4 h')
    await amount('Horas de visita asignadas', '1 h')
    await calendar.getByRole('button', { name: 'General', exact: true }).click()
    await amount('Horas de visita asignadas', '4 h')
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor()
    await calendar.getByRole('link', { name: 'Bruno Sin Equipo' }).waitFor()
    const nextWeekRequest = page.waitForRequest((request) => {
      const url = new URL(request.url())
      return (
        request.method() === 'GET' &&
        url.pathname.endsWith('/absence_requests') &&
        url.searchParams.get('start_date') === 'lte.2026-12-06'
      )
    })
    await calendar.getByRole('button', { name: 'Semana siguiente' }).click()
    await page.waitForURL((url) => url.searchParams.get('fecha') === '2026-12-01')
    await nextWeekRequest
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor()
    await amount('Horas de visita asignadas', '0 h')
    await capacity.getByText(/0,5 h fuera de la carga de las personas/).waitFor()
    await assertFits()

    await page.setViewportSize({ width: 1440, height: 900 })
    const table = calendar.getByRole('table', {
      name: 'Horarios previstos y ausencias de la semana',
    })
    await table.waitFor()
    assert.equal(await table.getByRole('columnheader').count(), 8)
    assert.equal(await table.getByRole('rowheader').count(), 3)
    await assertFits()
    await page.goto(`${origin}/trabajadores?vista=calendario&equipo=does-not-exist`)
    await page.getByRole('heading', { name: 'No se encontró esta ficha' }).waitFor()
    assert.equal(await calendar.count(), 0)
    const readCount = capacityReads
    staffPlan = false
    await page.goto(`${origin}/trabajadores?vista=calendario&fecha=${starts}`)
    await page.waitForURL((url) => url.pathname === '/ajustes')
    assert.equal(await capacity.count(), 0)
    staffPlan = true
    sessionRole = 'user'
    await page.goto(`${origin}/trabajadores?vista=calendario&fecha=${starts}`)
    await page.waitForURL((url) => url.pathname !== '/trabajadores')
    assert.equal(await capacity.count(), 0)
    assert.equal(capacityReads, readCount)
    process.stdout.write(
      'Calendario browser OK: mobile, desktop, date, daily filters, capacity and scopes, retry, permissions.\n',
    )
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
