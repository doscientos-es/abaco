// Run against a production-shaped local build with a fake Supabase URL and no real data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:4212'
const fake = 'http://localhost:54399'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [tenant, userId, work, client, estimate, first, second] = [1, 2, 3, 4, 5, 6, 7].map(id)
const now = new Date().toISOString()
const account = {
  id: tenant,
  name: 'Servicios de ejemplo',
  plan: 'standard',
  subscription_status: 'active',
}
const accepted = {
  id: estimate,
  tenant_id: tenant,
  client_id: client,
  number: 'P-2026-013',
  title: 'Revisión presupuestada',
  status: 'accepted',
  document_format: 'table',
  vat_rate: 21,
  created_at: now,
  estimate_lines: [
    {
      id: id(11),
      kind: 'labor',
      description: 'Inspección',
      quantity: 1,
      unit_price_cents: 50000,
      position: 1,
      unit: 'servicio',
    },
  ],
  estimate_milestones: [],
}
const order = {
  id: work,
  tenant_id: tenant,
  client_id: client,
  origin_estimate_id: estimate,
  title: 'Mantenimiento de ejemplo',
  description: '',
  kind: 'maintenance',
  status: 'ready',
  updated_at: now,
  created_at: now,
  source_snapshot: {
    estimate: accepted,
    client: { name: 'Cliente de ejemplo' },
    acceptance: { mode: 'office_manual', responded_at: now, responded_by: 'Persona de ejemplo' },
    publication_source: 'publication',
  },
}
const extras = [first, second].map((id, i) => ({
  id,
  description: i === 0 ? 'Cambio de filtro' : 'Revisión de motor',
  quantity: 1,
  unit: 'ud',
  unit_price_cents: 12500 * (i + 1),
  unit_cost_cents: 3000,
  price_cents: 12500 * (i + 1),
  planned_cost_cents: 3000,
  vat_rate: 21,
  status: 'pending',
  proposed_at: now,
}))
const decisions = []
const operations = []

async function main() {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH && { executablePath: process.env.CHROMIUM_PATH }),
  })
  try {
    const context = await browser.newContext({
      viewport: { width: 320, height: 760 },
      serviceWorkers: 'block',
    })
    const user = {
      id: userId,
      email: 'office@example.test',
      user_metadata: { full_name: 'Oficina Ejemplo' },
      app_metadata: {},
      aud: 'authenticated',
    }
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = Buffer.from(JSON.stringify({ sub: userId, exp })).toString('base64url')
    await context.addInitScript(
      (auth) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(auth)),
      {
        user,
        expires_at: exp,
        access_token: `eyJhbGciOiJIUzI1NiJ9.${token}.fixture`,
        refresh_token: 'fixture',
      },
    )
    await context.route('**/*', async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        name = u.pathname.split('/').pop()
      if (u.origin === origin) return route.continue()
      if (u.origin !== fake) return route.abort()
      const json = (value) =>
        route.fulfill({
          json: value,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'content-range': '0-1/2',
          },
        })
      if (req.method() === 'OPTIONS') return json(null)
      if (name === 'user') return json(user)
      if (name === 'my_company_memberships')
        return json([{ tenant_id: tenant, company_name: account.name, role: 'admin' }])
      if (name === 'is_platform_superadmin') return json(false)
      if (name === 'company_onboarding_status') return json(null)
      if (name === 'tenant_can_write' || name === 'can_use_staff') return json(true)
      if (name === 'tenants') return json(u.searchParams.has('id') ? account : [account])
      if (name === 'memberships')
        return json([{ user_id: userId, role: 'admin', profiles: { full_name: 'Oficina' } }])
      if (name === 'clients')
        return json([{ id: client, tenant_id: tenant, name: 'Cliente de ejemplo' }])
      if (name === 'estimates') return json([accepted])
      if (name === 'work_orders') return json(u.searchParams.has('id') ? order : [order])
      if (name === 'work_order_extras') return json(extras)
      if (name === 'work_extra_decisions') return json(decisions)
      if (name === 'decide_work_extra') {
        const p = req.postDataJSON()
        operations.push(p)
        assert.equal(p.p_extra_id, first)
        assert.equal(p.p_tenant_id, tenant)
        extras[0].status = p.p_decision
        decisions.push({
          id: id(12),
          extra_id: first,
          decision: p.p_decision,
          customer_name: p.p_customer_name,
          evidence_description: p.p_evidence_description,
          decided_at: now,
        })
        return json(first)
      }
      return json([])
    })
    const page = await context.newPage()
    await page.goto(`${origin}/trabajos/${work}`)
    const item = (name) =>
      page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })
    await item('Cambio de filtro').waitFor()
    assert.match(
      await page.getByRole('region', { name: 'Presupuesto base' }).innerText(),
      /605,00.*con IVA/,
    )
    await item('Cambio de filtro')
      .getByRole('button', { name: 'Registrar decisión' })
      .press('Enter')
    assert.match(await item('Cambio de filtro').innerText(), /125,00.*26,25.*151,25/)
    await page.getByLabel('Nombre de quien comunica la decisión').fill('Persona de ejemplo')
    await page.getByLabel('Evidencia y medio recibido').fill('Correo ficticio')
    const approve = page.getByRole('button', { name: 'Registrar aprobación' })
    assert.equal(await approve.isDisabled(), true)
    const confirmation = page.getByRole('checkbox', {
      name: 'He comprobado el importe de este extra.',
    })
    await confirmation.press('Space')
    assert.equal(await approve.isEnabled(), true)
    assert.equal(operations.length, 0)
    await approve.press('Enter')
    await page.getByText(/Aprobación registrado por oficina/).waitFor()
    assert.equal(operations.length, 1)
    await item('Revisión de motor')
      .getByRole('button', { name: 'Registrar decisión' })
      .press('Enter')
    assert.equal(await confirmation.isChecked(), false)
    assert.equal(await approve.isDisabled(), true)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    )
    assert.match(await page.getByRole('region', { name: 'Presupuesto base' }).innerText(), /605,00/)
    process.stdout.write(
      '320 px: importe base separado, confirmación requerida por extra, sin segundo envío.' + '\n',
    )
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  process.stderr.write(String(error?.stack ?? error) + '\n')
  process.exitCode = 1
})
