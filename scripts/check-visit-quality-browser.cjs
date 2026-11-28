// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Run against vite preview on port 4209 with PLAYWRIGHT_MODULE and CHROMIUM_PATH set.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4209'
const supabase = 'http://localhost:54399'
const tenant = '00000000-0000-4000-8000-000000000100'
const admin = '00000000-0000-4000-8000-000000000110'
const owner = '00000000-0000-4000-8000-000000000111'
const visit = '00000000-0000-4000-8000-000000000120'
const report = '00000000-0000-4000-8000-000000000130'
const record = {
  report_version_id: report,
  visit_id: visit,
  version: 2,
  closed_at: '2026-11-18T10:00:00Z',
  visit_title: 'Revisión de climatización',
  client_name: 'Cliente ficticio',
  revision: 0,
  status: null,
  category: null,
  owner_id: null,
}

async function run() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  try {
    const context = await browser.newContext({
      viewport: { width: 320, height: 800 },
      serviceWorkers: 'block',
    })
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = Buffer.from(JSON.stringify({ sub: admin, exp })).toString('base64url')
    await context.addInitScript(
      (session) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)),
      {
        user: {
          id: admin,
          email: 'admin@example.test',
          user_metadata: {},
          app_metadata: {},
          aud: 'authenticated',
        },
        expires_at: exp,
        access_token: `eyJhbGciOiJIUzI1NiJ9.${token}.fixture`,
        refresh_token: 'fixture',
      },
    )
    let role = 'admin'
    let failRead = true
    let failSave = true
    let listCalls = 0
    const saves = []
    const events = []
    await context.route('**/*', async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== supabase) return route.abort()
      const json = (value, status = 200, headers = {}) =>
        route.fulfill({
          json: value,
          status,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': '*',
            ...headers,
          },
        })
      if (req.method() === 'OPTIONS') return json(null)
      switch (url.pathname.split('/').at(-1)) {
        case 'my_company_memberships':
          return json([{ tenant_id: tenant, company_name: 'Empresa de pruebas', role }])
        case 'company_onboarding_status':
          return json(null)
        case 'is_platform_superadmin':
          return json(false)
        case 'tenant_can_write':
        case 'can_use_staff':
          return json(true)
        case 'tenants':
          return json([{ id: tenant, name: 'Empresa de pruebas' }])
        case 'memberships':
          return json([
            { user_id: admin, role: 'admin', profiles: { full_name: 'Administración de prueba' } },
            { user_id: owner, role: 'admin', profiles: { full_name: 'Coordinación ficticia' } },
          ])
        case 'list_pending_visit_report_reviews':
          return json([])
        case 'list_visit_quality_reviews': {
          listCalls++
          const { p_tenant, p_week, p_mode, p_offset } = req.postDataJSON()
          assert.equal(p_tenant, tenant)
          assert.equal(new Date(p_week + 'T12:00:00Z').getUTCDay(), 1)
          assert.equal(p_offset, 0)
          if (failRead) return json({ message: 'fixture unavailable' }, 400)
          return json(
            p_mode === 'sample' || ['pending', 'in_progress'].includes(record.status)
              ? [record]
              : [],
          )
        }
        case 'service_visit_report_versions':
          assert.equal(url.searchParams.get('id'), `eq.${report}`)
          return json({
            id: report,
            version: record.version,
            closed_at: record.closed_at,
            snapshot: {
              company: { name: 'Empresa de pruebas' },
              client: { name: record.client_name },
              visit: { title: record.visit_title },
              report: { data: { notes: 'Contenido ficticio del parte', checklist: [] } },
              tasks: [],
              activities: [],
              incidents: [],
            },
          })
        case 'service_visit_quality_events':
          assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
          assert.equal(url.searchParams.get('report_version_id'), `eq.${report}`)
          return json([...events].reverse())
        case 'record_visit_quality_review': {
          const payload = req.postDataJSON()
          saves.push(payload)
          assert.deepEqual(Object.keys(payload).sort(), [
            'p_category',
            'p_expected_revision',
            'p_operation',
            'p_owner',
            'p_report',
            'p_status',
            'p_tenant',
          ])
          assert.equal(payload.p_tenant, tenant)
          assert.equal(payload.p_report, report)
          assert.equal(payload.p_expected_revision, record.revision)
          assert.equal(payload.p_category, 'evidence')
          assert.equal(payload.p_owner, owner)
          if (failSave) return json({ message: 'fixture stopped save' }, 400)
          Object.assign(record, {
            revision: record.revision + 1,
            status: payload.p_status,
            category: payload.p_category,
            owner_id: payload.p_owner,
          })
          events.push({
            revision: record.revision,
            status: record.status,
            category: record.category,
            owner_id: record.owner_id,
            actor_id: admin,
            recorded_at: record.closed_at,
          })
          return json(record.revision)
        }
        default:
          return json([])
      }
    })
    const page = await context.newPage()
    page.setDefaultTimeout(20_000)
    await page.goto(`${origin}/trabajos?tab=revision`)
    await page.getByRole('heading', { name: 'Partes pendientes de revisión' }).waitFor()
    assert.equal(listCalls, 0)
    await page.getByText('Muestreo de calidad', { exact: true }).press('Enter')
    const panel = page.getByRole('region', { name: 'Supervisión de servicios' })
    await panel.getByRole('alert').waitFor()
    failRead = false
    await panel.getByRole('button', { name: 'Reintentar supervisión' }).press('Enter')
    await panel.getByRole('button', { name: /Supervisar Revisión/ }).press('Enter')
    const choose = async (field, option) => {
      await panel.getByRole('button', { name: field }).press('Enter')
      await page.getByRole('option', { name: option, exact: true }).press('Enter')
    }
    await choose(/Resultado/, 'Corrección pendiente')
    await choose(/Tipo de corrección/, 'Evidencia o documentación')
    await choose(/Responsable de seguimiento/, 'Coordinación ficticia')
    const save = panel.getByRole('button', { name: 'Guardar revisión' })
    assert.equal(await save.isDisabled(), true)
    assert.equal(saves.length, 0)
    await panel.getByRole('button', { name: 'Ver parte cerrado' }).press('Enter')
    await panel.getByRole('heading', { name: 'Parte cerrado · versión 2' }).waitFor()
    await save.press('Enter')
    await panel.getByText('No se pudo guardar la revisión. Puedes intentarlo de nuevo.').waitFor()
    failSave = false
    await save.press('Enter')
    await panel.getByText('Corrección pendiente · Coordinación ficticia', { exact: true }).waitFor()
    assert.equal(saves.length, 2)
    assert.equal(saves[0].p_operation, saves[1].p_operation)
    await panel.getByRole('button', { name: 'Correcciones abiertas' }).press('Enter')
    await panel.getByRole('button', { name: /Supervisar Revisión/ }).press('Enter')
    await panel.getByRole('button', { name: 'Ver historial' }).press('Enter')
    await panel
      .getByRole('region', { name: 'Historial de calidad' })
      .getByText(/Responsable: Coordinación ficticia/)
      .waitFor()
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      const fits = await page.locator('html').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
      assert.equal(fits, true, `Horizontal overflow at ${width}px`)
    }
    await choose(/Resultado/, 'Corregida')
    await save.press('Enter')
    await panel.getByText('No hay correcciones abiertas en esta página.').waitFor()
    await panel.getByRole('button', { name: 'Muestra semanal' }).press('Enter')
    await panel.getByText('Corregida · Coordinación ficticia', { exact: true }).waitFor()
    const before = listCalls
    role = 'user'
    await page.reload()
    await page.waitForURL((url) => url.pathname !== '/trabajos')
    assert.equal(await panel.count(), 0)
    assert.equal(listCalls, before)
    assert.equal(events.length, 2)
    process.stdout.write(
      'Quality browser OK: 320/1440, review, ownership, retry, history, scope permissions.\n',
    )
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
