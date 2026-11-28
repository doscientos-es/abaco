// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Vite preview --port 4194; PLAYWRIGHT_MODULE=/path/to/playwright node this-file.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4194'
const supabase = 'http://localhost:54399'
const tenant = '00000000-0000-4000-8000-000000000100'
const client = '00000000-0000-4000-8000-000000000101'
const user = {
  id: '00000000-0000-4000-8000-000000000110',
  email: 'admin@example.test',
  user_metadata: {},
  app_metadata: {},
  aud: 'authenticated',
}
const exp = Math.floor(Date.now() / 1000) + 3600
const jwt = Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url')
const tables = {
  tenants: [{ id: tenant, name: 'Empresa ficticia' }],
  clients: [{ id: client, tenant_id: tenant, name: 'Cliente ficticio' }],
}
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  try {
    const context = await browser.newContext({
      viewport: { width: 320, height: 740 },
      hasTouch: true,
      isMobile: true,
      serviceWorkers: 'block',
    })
    await context.addInitScript(
      (session) => {
        localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session))
      },
      {
        user,
        expires_at: exp,
        access_token: `eyJhbGciOiJIUzI1NiJ9.${jwt}.fixture`,
        refresh_token: 'fixture',
      },
    )
    let failReportVersions = true
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== supabase) return route.abort()
      const name = url.pathname.split('/').at(-1)
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
      if (name === 'my_company_memberships')
        return json([{ tenant_id: tenant, company_name: 'Empresa ficticia', role: 'admin' }])
      if (name === 'company_onboarding_status') return json(null)
      if (name === 'tenant_can_write') return json(true)
      if (name === 'is_platform_superadmin') return json(false)
      if (name === 'user') return json(user)
      if (name === 'service_visit_billing_reviews')
        return json([
          {
            visit_id: 'a',
            client_id: client,
            status: 'pending',
            source_kind: 'contract',
            created_at: '2026-11-21T00:00:00Z',
          },
          {
            visit_id: 'b',
            client_id: client,
            status: 'pending',
            source_kind: 'work_order',
            created_at: '2026-11-22T00:00:00Z',
          },
          {
            visit_id: 'c',
            client_id: client,
            status: 'bill_separately',
            source_kind: 'standalone',
            created_at: '2026-11-23T00:00:00Z',
          },
          {
            visit_id: 'd',
            client_id: client,
            status: 'pending',
            source_kind: 'standalone',
            created_at: '2026-11-24T00:00:00Z',
          },
        ])
      if (name === 'service_visits')
        return json([
          { id: 'a', title: 'Sin prueba de trabajo' },
          { id: 'b', title: 'Comprobar revisión' },
          { id: 'c', title: 'Verificar presupuesto' },
          { id: 'd', title: 'Lista para decisión de oficina' },
        ])
      if (name === 'service_visit_report_versions') {
        assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
        assert.equal(url.searchParams.get('select'), 'id,visit_id,version')
        if (failReportVersions) {
          return route.fulfill({
            status: 500,
            json: { message: 'Lectura simulada interrumpida' },
            headers: { 'access-control-allow-origin': '*' },
          })
        }
        return json([
          { id: 'b2', visit_id: 'b', version: 2 },
          { id: 'b1', visit_id: 'b', version: 1 },
          { id: 'c1', visit_id: 'c', version: 1 },
          { id: 'd1', visit_id: 'd', version: 1 },
        ])
      }
      if (name === 'service_visit_report_reviews') {
        assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
        assert.doesNotMatch(url.searchParams.get('report_version_id'), /b1/)
        return json([{ report_version_id: 'c1' }, { report_version_id: 'd1' }])
      }
      if (name === 'list_contract_invoice_notifications') return json([])
      assert.notEqual(
        name,
        'decide_service_visit_billing_review',
        'Opening the queue must not decide billing',
      )
      if (name === 'invoices') assert.equal(request.method(), 'GET')
      return json(tables[name] ?? [])
    })

    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    await page.goto(`${origin}/facturas?tab=visitas`)
    const queue = page.getByRole('region', { name: 'Visitas pendientes de facturación' })
    await queue.getByText('No se pudo comprobar el estado de las visitas.').waitFor()
    failReportVersions = false
    await queue.getByRole('button', { name: 'Reintentar' }).tap()
    const evidence = queue.getByRole('region', { name: 'Falta comprobar el parte' })
    await evidence.getByText('Sin parte cerrado', { exact: true }).waitFor()
    await evidence.getByText('Parte pendiente de revisión').waitFor()
    assert.match(
      await evidence.getByRole('link', { name: 'Ir a partes por revisar' }).getAttribute('href'),
      /tab=revision/,
    )
    const amount = queue.getByRole('region', { name: 'Verificar importe y factura' })
    assert.match(
      await amount.getByRole('link', { name: 'Abrir ficha del cliente' }).getAttribute('href'),
      /clientes\//,
    )
    await queue
      .getByRole('region', { name: 'Lista para decidir' })
      .getByText('Lista para decisión de oficina')
      .waitFor()
    const widths = await page
      .locator('#main-content')
      .evaluate((el) => [el.scrollWidth, el.clientWidth])
    assert.ok(widths[0] <= widths[1] + 1, `Desbordamiento horizontal: ${widths}`)
    process.stdout.write(
      'Visit billing queue: groups, metadata retry, scoped latest evidence and 320px passed.\n',
    )
  } finally {
    await browser.close()
  }
}
main().catch((error) => {
  process.stderr.write(`${error.stack}\n`)
  process.exitCode = 1
})
