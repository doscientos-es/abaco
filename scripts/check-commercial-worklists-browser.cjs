/* oxlint-disable eslint/no-console -- standalone smoke-test CLI output */
// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Vite preview --port 4196; PLAYWRIGHT_MODULE=/path/to/playwright node this-file.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4196'
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
const estimate = (number, status, valid_until, title) => ({
  id: `estimate-${number}`,
  tenant_id: tenant,
  client_id: client,
  number: `P-${number}`,
  status,
  title,
  valid_until,
  estimate_lines: [],
  estimate_milestones: [],
})
const invoice = (number, due_date, paid_cents, concept) => ({
  id: `invoice-${number}`,
  tenant_id: tenant,
  client_id: client,
  number: `F-${number}`,
  concept,
  due_date,
  issued_at: '2020-01-01',
  total_cents: 10000,
  paid_cents,
})
const tables = {
  tenants: [{ id: tenant, name: 'Empresa ficticia' }],
  clients: [{ id: client, tenant_id: tenant, name: 'Cliente ficticio' }],
  estimates: [
    estimate(3, 'sent', '2090-12-13', 'Enviado futuro'),
    estimate(2, 'sent', '2020-01-08', 'Enviado antiguo'),
    estimate(4, 'accepted', '2020-01-07', 'Ya aceptado'),
    estimate(1, 'sent', null, 'Enviado sin fecha'),
  ],
  invoices: [
    invoice(3, '2090-12-13', 0, 'Factura futura'),
    invoice(2, '2020-01-08', 2500, 'Reparación parcial'),
    invoice(1, '2020-01-07', 10000, 'Ya cobrada'),
  ],
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
      return json(tables[name] ?? [])
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const noOverflow = async () => {
      const dims = await page
        .locator('#main-content')
        .evaluate((node) => [
          node.scrollWidth,
          node.clientWidth,
          document.documentElement.scrollWidth,
          document.documentElement.clientWidth,
        ])
      assert.ok(dims[0] <= dims[1] + 1 && dims[2] <= dims[3] + 1, `Overflow: ${dims}`)
    }
    const shown = (text) => page.getByText(text, { exact: true }).filter({ visible: true }).first()
    await page.goto(`${origin}/presupuestos`)
    const quotes = page.getByRole('group', { name: 'Seguimiento de presupuestos' })
    const awaiting = quotes.getByRole('button', { name: 'Sin respuesta 3' })
    await awaiting.tap()
    await page.waitForURL((url) => url.searchParams.get('seguimiento') === 'sin-respuesta')
    await shown('Enviado antiguo').waitFor()
    await shown('Enviado futuro').waitFor()
    await shown('Enviado sin fecha').waitFor()
    assert.ok(
      (await shown('Enviado antiguo').boundingBox()).y <
        (await shown('Enviado futuro').boundingBox()).y,
    )
    assert.ok(
      (await shown('Enviado futuro').boundingBox()).y <
        (await shown('Enviado sin fecha').boundingBox()).y,
    )
    await shown('Ya aceptado').waitFor({ state: 'hidden' })
    const expired = quotes.getByRole('button', { name: 'Vigencia pasada 1' })
    await expired.focus()
    await page.keyboard.press('Enter')
    await page.waitForURL((url) => url.searchParams.get('seguimiento') === 'fecha-pasada')
    await page.reload()
    await shown('Enviado antiguo').waitFor()
    assert.equal(await expired.getAttribute('aria-pressed'), 'true')
    await shown('Enviado futuro').waitFor({ state: 'hidden' })
    await noOverflow()

    await page.goto(`${origin}/facturas`)
    const payments = page.getByRole('group', { name: 'Seguimiento de cobros' })
    await payments.getByRole('button', { name: /Vencidas/ }).tap()
    await page.waitForURL((url) => url.searchParams.get('cobro') === 'vencidas')
    await shown('Reparación parcial').waitFor()
    await shown('Ya cobrada').waitFor({ state: 'hidden' })
    await shown('Factura futura').waitFor({ state: 'hidden' })
    const repair = page
      .locator('li')
      .filter({ hasText: 'Reparación parcial' })
      .filter({ visible: true })
    assert.match(await repair.innerText(), /75,00.*€/u)
    await page.getByRole('searchbox', { name: 'Buscar facturas' }).fill('F-2')
    await page.waitForURL(
      (url) => url.searchParams.get('q') === 'F-2' && url.searchParams.get('cobro') === 'vencidas',
    )
    await page.getByRole('button', { name: 'Filtros adicionales' }).waitFor()
    await noOverflow()
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('row').filter({ hasText: 'Reparación parcial' }).waitFor()
    await noOverflow()
    console.log(
      'Commercial worklists OK: touch, keyboard, saved scope, payments, no horizontal overflow.',
    )
  } finally {
    await browser.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
