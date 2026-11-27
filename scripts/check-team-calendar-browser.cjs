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
    const accessed = []
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== supabase) return route.abort()
      const json = (value) =>
        route.fulfill({
          json: value,
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
          return json(null)
        case 'tenant_can_write':
        case 'can_use_staff':
          return json(true)
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
          ])
        case 'absence_requests':
          assert.equal(request.method(), 'GET')
          assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
          // The app shell also fetches the existing requests badge, which is separate from this view.
          if (!url.searchParams.get('start_date')) return json([])
          assert.equal(url.searchParams.get('select'), 'requester_id,start_date,end_date,status')
          accessed.push(url.searchParams.get('start_date'))
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
    await calendar.getByRole('button', { name: 'martes, 24 de noviembre' }).click()
    await calendar.getByText('14:00–17:00', { exact: true }).filter({ visible: true }).waitFor()
    await calendar.getByRole('combobox', { name: 'Por equipo' }).selectOption(north)
    await page.waitForURL((url) => url.searchParams.get('equipo') === north)
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor()
    await calendar.getByRole('link', { name: 'Bruno Sin Equipo' }).waitFor({ state: 'hidden' })
    await page.reload()
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor()
    assert.equal(await calendar.getByRole('combobox', { name: 'Por equipo' }).inputValue(), north)
    await calendar.getByRole('combobox', { name: 'Por trabajador' }).selectOption(bruno)
    await page.waitForURL((url) => url.searchParams.get('persona') === bruno)
    assert.equal(new URL(page.url()).searchParams.get('equipo'), null)
    await calendar.getByRole('link', { name: 'Bruno Sin Equipo' }).waitFor()
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor({ state: 'hidden' })
    await calendar.getByRole('button', { name: 'General', exact: true }).click()
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor()
    await calendar.getByRole('link', { name: 'Bruno Sin Equipo' }).waitFor()
    await calendar.getByRole('button', { name: 'Semana siguiente' }).click()
    await page.waitForURL((url) => url.searchParams.get('fecha') === '2026-12-01')
    await calendar.getByRole('link', { name: 'Ana Ficticia' }).waitFor()
    assert.ok(accessed.includes('lte.2026-12-06'))
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
    process.stdout.write('Calendario browser OK: mobile, desktop, time and scopes.\n')
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
