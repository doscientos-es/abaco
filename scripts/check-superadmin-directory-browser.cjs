// Run against a built local fixture: VITE_SUPABASE_URL=http://localhost:54399
// VITE_SUPABASE_PUBLISHABLE_KEY=fixture pnpm exec vite build; pnpm exec vite preview --port 4188
// PLAYWRIGHT_MODULE=/path/to/playwright [CHROMIUM_PATH=/path/to/chromium] node scripts/check-superadmin-directory-browser.cjs
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4188'
const fakeSupabase = 'http://localhost:54399'
const company = {
  id: '00000000-0000-4000-8000-000000000100',
  name: 'Taller Horizonte Digital',
  plan: 'standard',
  subscription_status: 'active',
  billing_interval: 'month',
  current_period_end: '2030-07-31T12:00:00Z',
  created_at: '2025-01-10T12:00:00Z',
  is_complimentary: false,
  member_count: 4,
  has_pending_payment: false,
}
const user = {
  id: '00000000-0000-4000-8000-000000000200',
  email: 'admin@example.test',
  user_metadata: {},
  app_metadata: {},
  aud: 'authenticated',
}
const exp = Math.floor(Date.now() / 1000) + 3600
const accessTokenData = Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url')
const session = {
  access_token: `eyJhbGciOiJIUzI1NiJ9.${accessTokenData}.fixture`,
  refresh_token: 'fixture',
  expires_at: exp,
  user,
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
      viewport: { width: 320, height: 780 },
      serviceWorkers: 'block',
    })
    await context.addInitScript(
      (fixture) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(fixture)),
      session,
    )
    let paused = false
    let archived = null
    const actions = []
    const listCalls = []
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== fakeSupabase) return route.abort()
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
      const name = url.pathname.split('/').at(-1)
      if (name === 'my_company_memberships')
        return json([{ tenant_id: company.id, company_name: company.name, role: 'user' }])
      if (name === 'is_platform_superadmin') return json(true)
      if (name === 'superadmin_company') return json(company)
      if (name === 'billing_catalog') return json([])
      if (name === 'superadmin_company_directory_v2') {
        const p = request.postDataJSON()
        listCalls.push(p)
        const bucket = archived ? 'archived' : paused ? 'paused' : 'active'
        const rows = p.p_status
          ? p.p_status === bucket
            ? [company]
            : []
          : archived
            ? []
            : [company]
        return json({
          rows: rows.map((entry) => ({
            ...entry,
            billing_bucket: bucket,
            archived_at: archived,
            cancel_at_period_end: paused,
            pausable: !archived && !paused,
            resumable: !archived && paused,
          })),
          counts: { [bucket]: 1 },
          total: rows.length,
        })
      }
      if (name === 'superadmin_company_action') {
        const p = request.postDataJSON()
        assert.equal(p.p_tenant, company.id)
        assert.equal(p.p_expected_pause, paused)
        assert.equal(p.p_expected_archived_at, archived)
        actions.push(p.p_action)
        if (p.p_action === 'pause') paused = true
        if (p.p_action === 'resume') paused = false
        if (p.p_action === 'archive') archived = '2030-07-15T12:00:00Z'
        if (p.p_action === 'restore') archived = null
        return json(null)
      }
      if (name === 'superadmin_subscription_invoice_directory') {
        const p = request.postDataJSON()
        assert.equal(p.p_tenant, company.id)
        if (p.p_reference) assert.equal(p.p_reference, '0123AbCd')
        return json([
          {
            id: 'payment',
            tenant_id: company.id,
            company_name: company.name,
            invoice_number: 'ML-SUS-001',
            invoice_status: 'sent',
            invoice_portal_url: null,
            merchant_order: '0123AbCd',
            amount_cents: 3400,
            paid_at: '2030-07-15T12:00:00Z',
          },
        ])
      }
      return json([])
    })
    const page = await context.newPage()
    const assertFits = async () => {
      const box = await page
        .locator('#platform-content')
        .evaluate((main) => ({ full: main.scrollWidth, available: main.clientWidth }))
      assert.ok(box.full <= box.available + 1, `Horizontal overflow: ${JSON.stringify(box)}`)
    }
    const openMenu = async () => {
      const menuButton = page.getByRole('button', { name: `Acciones de ${company.name}` })
      await menuButton.waitFor()
      await menuButton.press('Enter')
    }
    const confirm = async (label) => {
      const dialog = page.getByRole('alertdialog', { name: label })
      await dialog.getByRole('button', { name: label, exact: true }).click()
    }

    await page.goto(`${origin}/superadmin`)
    await page.getByRole('table', { name: 'Empresas de Menoslios' }).waitFor()
    await assertFits()
    await openMenu()
    await page.getByRole('menuitem', { name: 'Pausar renovación' }).click()
    await confirm('Pausar renovación')
    await page.getByText('No renueva', { exact: true }).first().waitFor()
    await openMenu()
    await page.getByRole('menuitem', { name: 'Archivar empresa' }).click()
    await confirm('Archivar empresa')
    await page.getByText('Aún no hay empresas', { exact: true }).waitFor()
    await page.getByRole('link', { name: 'Archivadas 1' }).click()
    await openMenu()
    await page.getByRole('menuitem', { name: 'Restaurar empresa' }).click()
    await confirm('Restaurar empresa')
    await page.getByText('No hay empresas archivadas', { exact: true }).waitFor()
    await page.getByRole('link', { name: 'Renovación pausada 1' }).click()
    await openMenu()
    await page.getByRole('menuitem', { name: 'Reanudar renovación' }).click()
    await confirm('Reanudar renovación')
    await page.getByRole('link', { name: 'Activas de pago 1' }).click()
    await openMenu()
    await page.getByRole('menuitem', { name: 'Ver facturas' }).click()
    await page.getByRole('heading', { name: `Facturas de ${company.name}` }).waitFor()
    await assertFits()
    await page.getByRole('button', { name: 'Acciones de factura ML-SUS-001' }).press('Enter')
    await page.getByRole('menuitem', { name: 'Ver detalle' }).click()
    await page.getByRole('heading', { name: 'ML-SUS-001' }).waitFor()
    await page.getByRole('link', { name: 'Volver a facturas', exact: true }).click()
    await page.getByRole('heading', { name: `Facturas de ${company.name}` }).waitFor()
    await page.setViewportSize({ width: 1280, height: 900 })
    await assertFits()
    assert.deepEqual(actions, ['pause', 'archive', 'restore', 'resume'])
    assert.ok(listCalls.some((p) => p.p_status === 'archived'))
    process.stdout.write(
      'Superadmin directory smoke: 320px + desktop, keyboard row menus, reversible confirmation and scoped invoices.\n',
    )
  } finally {
    await browser.close()
  }
}

void run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
