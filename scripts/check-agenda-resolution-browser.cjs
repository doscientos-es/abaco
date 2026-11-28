// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Run against vite preview in port 4199 with PLAYWRIGHT_MODULE and CHROMIUM_PATH set.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4199'
const supabase = 'http://localhost:54399'
const tenant = '00000000-0000-4000-8000-000000000100'
const admin = '00000000-0000-4000-8000-000000000110'
const ana = '00000000-0000-4000-8000-000000000111'
const bruno = '00000000-0000-4000-8000-000000000112'
const unknownPerson = '00000000-0000-4000-8000-000000000113'
const occupied = '00000000-0000-4000-8000-000000000114'
const otherFunction = '00000000-0000-4000-8000-000000000115'
const requiredFunction = '00000000-0000-4000-8000-000000000130'
const unrelatedFunction = '00000000-0000-4000-8000-000000000131'
const team = '00000000-0000-4000-8000-000000000120'
const tz = 'Europe/Madrid'
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(new Date())
const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)
const threeDayEnd = new Date(Date.parse(tomorrow + 'T12:00:00Z') + 86400000)
  .toISOString()
  .slice(0, 10)
const weekday = new Date(today + 'T12:00:00Z').getUTCDay() || 7
const rows = [
  ['unassigned', 'Visita por asignar', today, '08', null, null, 'scheduled'],
  ['absence', 'Visita con ausencia', today, '09', ana, null, 'scheduled'],
  ['team', 'Visita con equipo', today, '10', null, team, 'scheduled'],
  ['unknown', 'Visita sin verificar', today, '11', null, undefined, 'scheduled'],
  ['canceled', 'Visita cancelada', today, '12', null, null, 'canceled'],
  ['tomorrow', 'Visita por asignar mañana', tomorrow, '13', null, null, 'scheduled'],
].map(([id, title, day, hour, assigned_user_id, work_team_id, status]) => ({
  id,
  title,
  assigned_user_id,
  work_team_id,
  status,
  priority: 'normal',
  scheduled_start_at: `${day}T${hour}:00:00Z`,
  scheduled_end_at: `${day}T${hour}:30:00Z`,
  updated_at: `${day}T00:00:00Z`,
  timezone: tz,
  client_name: 'Cliente de prueba',
  location_name: 'Oficina',
  address: '',
  notes: '',
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
    const token = Buffer.from(JSON.stringify({ sub: admin, exp })).toString('base64url')
    await context.addInitScript(
      (session) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)),
      {
        user,
        expires_at: exp,
        access_token: `eyJhbGciOiJIUzI1NiJ9.${token}.fixture`,
        refresh_token: 'fixture',
      },
    )
    let failAbsences = true
    let replans = 0
    let failOverlap = true
    let staffPlan = true
    let sessionRole = 'admin'
    let scheduleReads = 0
    let overlapReads = 0
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
          return json([
            {
              user_id: ana,
              role: 'user',
              profiles: { full_name: 'Ana Ficticia', email: 'ana@example.test' },
            },
            {
              user_id: bruno,
              role: 'user',
              profiles: { full_name: 'Bruno disponible', email: 'bruno@example.test' },
            },
            { user_id: unknownPerson, role: 'user', profiles: { full_name: 'Persona sin turno' } },
            { user_id: occupied, role: 'user', profiles: { full_name: 'Persona ocupada' } },
            {
              user_id: otherFunction,
              role: 'user',
              profiles: { full_name: 'Persona con otra función' },
            },
          ])
        case 'list_office_visits': {
          assert.equal(request.postDataJSON().p_tenant_id, tenant)
          return json(rows.map(({ work_team_id: _workTeam, ...visit }) => visit))
        }
        case 'staff_functions':
          assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
          return json([{ id: requiredFunction, name: 'Electricidad' }])
        case 'staff_schedules':
          scheduleReads++
          assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
          return json(
            [bruno, occupied, otherFunction].map((user_id) => ({
              user_id,
              updated_at: `${today}T00:00:00Z`,
              slots: [{ weekday, start: 0, end: 1440 }],
            })),
          )
        case 'staff_function_assignments':
          assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
          return json(
            [bruno, occupied, otherFunction].map((user_id) => ({
              user_id,
              function_id: user_id === otherFunction ? unrelatedFunction : requiredFunction,
            })),
          )
        case 'work_teams':
          return json([
            {
              id: team,
              name: 'Equipo de apoyo',
              description: '',
              archived_at: null,
              updated_at: `${today}T00:00:00Z`,
              work_team_members: [{ user_id: occupied }],
            },
          ])
        case 'service_visits':
          if (url.searchParams.has('scheduled_start_at')) {
            overlapReads++
            assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
            assert.equal(url.searchParams.get('status'), 'in.(scheduled,in_progress)')
            assert.deepEqual(url.searchParams.getAll('scheduled_start_at'), [
              `lt.${today}T09:30:00Z`,
              `gte.${new Date(Date.parse(today + 'T09:00:00Z') - 12 * 60 * 60_000).toISOString()}`,
            ])
            assert.equal(url.searchParams.get('scheduled_end_at'), `gt.${today}T09:00:00Z`)
            if (failOverlap) return json({ message: 'Fixture failure' }, 400)
            const target = rows.find(({ id }) => id === 'absence')
            return json([
              {
                id: target.id,
                assigned_user_id: target.assigned_user_id,
                work_team_id: null,
                work_order_id: null,
                work_orders: null,
                updated_at: target.updated_at,
              },
              { id: 'other-booking', assigned_user_id: null, work_team_id: team },
            ])
          }
          return json(
            rows
              .filter((row) => row.work_team_id !== undefined)
              .map(({ id, work_team_id }) => ({ id, work_team_id, route_order: 0 })),
          )
        case 'absence_requests': {
          if (url.searchParams.get('status') !== 'eq.approved') return json([])
          assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
          assert.equal(url.searchParams.get('select'), 'requester_id,start_date,end_date')
          if (failAbsences && url.searchParams.get('start_date') === `lte.${threeDayEnd}`)
            return json({ message: 'Fixture failure' }, 400)
          return json([{ requester_id: ana, start_date: today, end_date: today }])
        }
        case 'replan_service_visit_local': {
          const payload = request.postDataJSON()
          assert.equal(payload.p_tenant_id, tenant)
          assert.ok(['unassigned', 'absence'].includes(payload.p_visit_id))
          assert.equal(payload.p_expected_updated_at, `${today}T00:00:00Z`)
          assert.equal(payload.p_duration_minutes, 30)
          assert.equal(payload.p_assigned_user_id, bruno)
          assert.equal(
            payload.p_reason,
            payload.p_visit_id === 'unassigned'
              ? 'Cubrir visita sin equipo'
              : 'Cubrir ausencia confirmada',
          )
          assert.match(payload.p_operation_id, /^[0-9a-f-]{36}$/)
          replans += 1
          rows.find(({ id }) => id === payload.p_visit_id).assigned_user_id = bruno
          return json(null)
        }
        default:
          return json([])
      }
    })

    const page = await context.newPage()
    page.setDefaultTimeout(20_000)
    await page.goto(`${origin}/trabajos?view=list&period=day&date=${today}`)
    const inbox = page.getByRole('region', { name: 'Por resolver' })
    await inbox.getByText('No se pudieron comprobar las ausencias confirmadas.').waitFor()
    await inbox.getByText('Sin persona ni equipo', { exact: true }).waitFor()
    assert.equal(await inbox.getByText('No hay incidencias', { exact: false }).count(), 0)
    failAbsences = false
    await inbox.getByRole('button', { name: 'Reintentar ausencias' }).press('Enter')
    await inbox.getByText('Ausencia confirmada', { exact: true }).waitFor()
    await inbox.getByText('Asignación sin verificar', { exact: true }).waitFor()
    assert.equal(
      await inbox.getByRole('button', { name: 'Reprogramar Visita sin verificar' }).count(),
      0,
    )
    assert.equal(await inbox.getByText('Visita con equipo').count(), 0)
    assert.equal(await inbox.getByText('Visita cancelada').count(), 0)

    const dialog = page.getByRole('dialog', { name: 'Resolver asignación' })
    await inbox.getByRole('button', { name: 'Reprogramar Visita con ausencia' }).press('Enter')
    await dialog.getByRole('button', { name: 'Sugerir sustituto' }).press('Enter')
    const panel = dialog.getByRole('region', { name: 'Sugerir sustituto' })
    await panel.getByRole('button', { name: /Función requerida/ }).click()
    assert.equal(scheduleReads, 0)
    await page.getByRole('option', { name: 'Electricidad' }).click()
    await panel.getByRole('alert').waitFor()
    assert.equal(await panel.getByRole('button', { name: 'Bruno disponible' }).count(), 0)
    failOverlap = false
    await panel.getByRole('button', { name: 'Reintentar comprobación' }).press('Enter')
    const substitute = panel.getByRole('button', { name: 'Bruno disponible' })
    await substitute.waitFor()
    await panel
      .getByText('Disponibilidad sin verificar: 1 persona sin horario comprobable.')
      .waitFor()
    assert.equal(
      await panel.getByRole('button', { name: /Persona ocupada|otra función/ }).count(),
      0,
    )
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 820 })
      assert.equal(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), true)
    }
    await substitute.press('Enter')
    assert.equal(await substitute.getAttribute('aria-pressed'), 'true')
    assert.equal(await dialog.getByRole('button', { name: 'Guardar cambio' }).isDisabled(), true)
    assert.equal(replans, 0)
    await dialog.getByLabel('Duración en minutos').fill('45')
    await panel.getByText(/solo se comprueban para la hora y duración originales/).waitFor()
    assert.equal(await substitute.count(), 0)
    await dialog.getByLabel('Duración en minutos').fill('30')
    assert.match(
      await dialog.getByRole('button', { name: /Técnico/ }).innerText(),
      /Bruno disponible/,
    )
    await dialog.getByLabel('Motivo del cambio').fill('Cubrir ausencia confirmada')
    await dialog.getByRole('button', { name: 'Guardar cambio' }).press('Enter')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(replans, 1)

    await inbox.getByRole('button', { name: 'Reprogramar Visita por asignar', exact: true }).click()
    assert.equal(await dialog.getByRole('button', { name: 'Sugerir sustituto' }).count(), 0)
    await dialog.getByLabel('Motivo del cambio').waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Guardar cambio' }).isDisabled(), true)
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(replans, 1)
    await inbox.getByRole('button', { name: 'Reprogramar Visita por asignar', exact: true }).click()
    await dialog.getByRole('button', { name: /Técnico/ }).click()
    await page.getByRole('option', { name: 'Bruno disponible' }).click()
    await dialog.getByLabel('Motivo del cambio').fill('Cubrir visita sin equipo')
    await dialog.getByRole('button', { name: 'Guardar cambio' }).click()
    await dialog.waitFor({ state: 'hidden' })
    await inbox
      .getByRole('button', { name: 'Reprogramar Visita por asignar', exact: true })
      .waitFor({ state: 'hidden' })
    assert.equal(replans, 2)

    await inbox.getByRole('button', { name: /^Mañana/ }).click()
    await inbox.getByRole('button', { name: 'Reprogramar Visita por asignar mañana' }).waitFor()
    assert.equal(await inbox.getByText('Ausencia confirmada', { exact: true }).count(), 0)
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 820 })
      const fits = await page
        .locator('html')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
      assert.equal(fits, true, `Unexpected horizontal overflow at ${width}px`)
    }
    staffPlan = false
    rows.find(({ id }) => id === 'absence').assigned_user_id = ana
    const priorReads = { scheduleReads, overlapReads }
    await page.reload()
    await inbox.getByRole('button', { name: 'Reprogramar Visita con ausencia' }).click()
    await dialog.getByRole('button', { name: 'Sugerir sustituto' }).click()
    await dialog.getByText(/requieren horarios y funciones del módulo Trabajadores/).waitFor()
    assert.deepEqual({ scheduleReads, overlapReads }, priorReads)
    sessionRole = 'user'
    await page.reload()
    await inbox.waitFor({ state: 'hidden' })
    assert.deepEqual({ scheduleReads, overlapReads }, priorReads)
    process.stdout.write(
      'Por resolver browser OK: today/tomorrow, unknown, retry, substitution checks and permissions, fixture reassignment and responsive widths.\n',
    )
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
