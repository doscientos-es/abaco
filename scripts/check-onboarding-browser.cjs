// Run with Playwright installed in a separate tooling directory; this adds no app dependency.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { readFileSync } = require('node:fs')
const { createHmac } = require('node:crypto')
const { PGlite } = require('@electric-sql/pglite')
const {
  bookingConfirmation,
  validCalSignature,
} = require('../supabase/functions/_shared/onboarding-cal.ts')
const origin = 'http://127.0.0.1:4179'
let tenant
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'owner@example.test',
  user_metadata: { full_name: 'Prova Ábaco' },
  app_metadata: { provider: 'email' },
  aud: 'authenticated',
}
let reference
const exp = Math.floor(Date.now() / 1000) + 7200
const payload = Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url')
const session = {
  access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,
  refresh_token: 'fixture',
  expires_at: exp,
  user,
}
const rate = {
  plan: 'standard',
  seats: 1,
  monthly_cents: 3480,
  yearly_cents: 34800,
  seat_monthly_cents: 800,
  vat_percent: 21,
}
const products = [
  ['workers', 900, 9000],
  ['procurement', 1500, 15000],
  ['ai', 375, 4500],
  ['mcp', 900, 9000],
].map(([code, monthly_cents, yearly_cents]) => ({ code, monthly_cents, yearly_cents }))
;(async () => {
  const db = new PGlite()
  const sql = (file) => readFileSync(join(__dirname, '..', file), 'utf8')
  await db.exec(sql('supabase/tests/fixtures/guided-company-onboarding.sql'))
  await db.exec(sql('supabase/migrations/20261126185711_guided_company_onboarding.sql'))
  await db.query("select set_config('test.uid',$1,false)", [user.id])
  const value = async (query, args = []) =>
    Object.values((await db.query(query, args)).rows[0] ?? {})[0]
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    ...(process.env.CHROMIUM_RESTRICTED === '1'
      ? {
          args: [
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-software-rasterizer',
          ],
        }
      : {}),
  })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
    await context.addInitScript((s) => {
      if (!localStorage.getItem('sb-localhost-auth-token'))
        localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s))
    }, session)
    let courtesy = false
    let showcase = false
    let paymentAttempts = 0
    const settlePayment = async (success) => {
      await db.query(
        "update public.billing_payments set status=$1 where tenant_id=$2 and status='pending'",
        [success ? 'succeeded' : 'failed', tenant],
      )
      if (success) {
        await db.query(
          "update public.tenants set subscription_status='active',current_period_end=now()+interval '1 year' where id=$1",
          [tenant],
        )
        await db.query(
          'update public.tenant_modules set enabled=next_enabled,next_enabled=null where tenant_id=$1 and next_enabled is not null',
          [tenant],
        )
      }
    }
    let profile = null
    let businessRequests = 0
    await context.route('**/*', async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname
      const json = (value, status = 200) =>
        route.fulfill({
          json: value,
          status,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': '*',
            'access-control-allow-headers': '*',
          },
        })
      if (url.origin === origin) return route.continue()
      if (url.origin === 'https://cal.eu')
        return route.fulfill({ contentType: 'text/html', body: '<h1>Agenda simulada</h1>' })
      if (url.hostname !== 'localhost') return route.abort()
      if (request.method() === 'OPTIONS') return json({})
      if (path.startsWith('/auth/v1/user')) return json(user)
      if (path.endsWith('/create_company')) {
        tenant = await value('select public.create_company($1)', [request.postDataJSON().p_name])
        return json(tenant)
      }
      if (path.endsWith('/my_company_memberships'))
        return json(
          tenant
            ? [
                {
                  tenant_id: tenant,
                  company_name: courtesy ? 'Empresa de cortesía' : 'Empresa de pruebas',
                  role: 'admin',
                },
              ]
            : [],
        )
      if (path.endsWith('/company_onboarding_status'))
        return json(await value('select public.company_onboarding_status($1)', [tenant]))
      if (path.endsWith('/tenant_can_write'))
        return json(await value('select public.tenant_can_write($1)', [tenant]))
      if (path.endsWith('/billing_catalog')) return json([rate])
      if (path.endsWith('/billing_module_catalog')) return json(products)
      if (path.endsWith('/subscription_billing_profiles')) {
        if (request.method() === 'POST') {
          profile = request.postDataJSON()
          return json(null)
        }
        return json(profile)
      }
      if (path.endsWith('/functions/v1/billing')) {
        const input = request.postDataJSON()
        assert.equal(input.action, 'onboarding-checkout')
        assert.equal(input.interval, 'year')
        assert.equal(input.seats, 3)
        assert.equal(input.total, 81675)
        assert.deepEqual(input.modules.sort(), ['ai', 'workers'])
        ++paymentAttempts
        await value('select public.reserve_onboarding_payment($1,$2,$3,$4,$5,$6,$7,$8)', [
          tenant,
          JSON.stringify(profile),
          `1234ABC${paymentAttempts}`,
          user.id,
          input.interval,
          input.seats,
          input.total,
          input.modules,
        ])
        return json({
          form: {
            url: 'http://localhost:54399/redsys',
            signatureVersion: 'HMAC_SHA512_V2',
            merchantParameters: 'fixture',
            signature: 'fixture',
          },
        })
      }
      if (path === '/redsys') {
        const result = paymentAttempts === 1 ? 'cancelado' : 'ok'
        return route.fulfill({
          status: 303,
          headers: { location: origin + '/bienvenida?pago=' + result },
        })
      }
      if (path.endsWith('/tenants')) {
        businessRequests++
        const row = {
          id: tenant,
          name: courtesy ? 'Empresa de cortesía' : 'Empresa de pruebas',
          plan: 'standard',
          subscription_status: 'active',
          billing_interval: 'year',
          trial_ends_at: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 86400000).toISOString(),
          cancel_at_period_end: false,
          is_complimentary: courtesy,
        }
        return json(request.headers().accept?.includes('object') ? row : [row])
      }
      if (path.endsWith('/clients') || path.endsWith('/estimates')) businessRequests++
      if (path.endsWith('/can_use_staff'))
        return json(await value("select app_private.tenant_module_enabled($1,'workers')", [tenant]))
      if (path.endsWith('/ai_my_access'))
        return json(await value('select public.ai_my_access($1)', [tenant]))
      if (path.endsWith('/ai_my_credits'))
        return json({ monthly_limit: 500, monthly_used: 22, extra_remaining: 0 })
      if (path.endsWith('/tenant_modules')) {
        const { rows } = await db.query(
          'select module_code, enabled, gifted from public.tenant_modules where tenant_id=$1',
          [tenant],
        )
        return json(
          showcase ? [...rows, { module_code: 'procurement', enabled: true, gifted: false }] : rows,
        )
      }
      if (path.endsWith('/memberships'))
        return json([
          {
            user_id: user.id,
            role: 'admin',
            profiles: { email: user.email, full_name: 'Núria Vila' },
          },
        ])
      if (path.endsWith('/suppliers'))
        return json([
          {
            id: 'supplier-1',
            name: 'Materials Montseny',
            email: 'pedidos@example.test',
            phone: '900 000 010',
          },
          {
            id: 'supplier-2',
            name: 'Electricitat Mar',
            email: 'material@example.test',
            phone: '900 000 020',
          },
        ])

      if (path.endsWith('/billing_preview'))
        return json({ current: { seats: 3 }, next: null, pending: false })
      return json([])
    })
    const page = await context.newPage()
    page.on('pageerror', (e) => process.stderr.write(`pageerror: ${e.message}\n`))
    await page.goto(origin)
    await page.getByRole('button', { name: 'Crear una empresa' }).click()
    await page.getByRole('textbox', { name: 'Nombre de la empresa' }).fill('Empresa de pruebas')
    await page.getByRole('button', { name: 'Crear empresa', exact: true }).click()
    await page.getByRole('heading', { name: 'Configura tu Ábaco' }).waitFor()
    await page.getByRole('checkbox', { name: 'Añadir Trabajadores' }).check()
    await page.getByRole('checkbox', { name: 'Añadir Asistente de IA' }).check()
    await page.getByText('Ver qué incluye').first().click()
    await page.screenshot({ path: join(tmpdir(), 'abaco-dev45-desktop.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390)
    await page.screenshot({ path: join(tmpdir(), 'abaco-dev45-mobile.png'), fullPage: true })
    const submit = async (fillProfile) => {
      await page.getByRole('button', { name: 'Elegir licencias' }).click()
      await page.getByRole('spinbutton', { name: 'Licencias, incluyéndote' }).fill('3')
      await page.getByRole('radio', { name: 'Anual, en un solo cobro' }).check()
      await page.getByRole('button', { name: 'Revisar suscripción' }).click()
      assert.match(await page.locator('main').innerText(), /816,75/)
      if (fillProfile) {
        const form = {
          'Razón social o nombre fiscal': 'Empresa ficticia',
          NIF: 'B12345678',
          'Dirección fiscal': 'Carrer de Prova 1',
          'Código postal': '08300',
          Municipio: 'Mataró',
          Provincia: 'Barcelona',
          'Correo para recibir facturas': 'owner@example.test',
        }
        for (const [label, value] of Object.entries(form))
          await page.getByLabel(label, { exact: true }).fill(value)
        await page.getByRole('button', { name: 'Guardar datos fiscales' }).click()
        await page.getByText('Datos fiscales guardados.').waitFor({ state: 'attached' })
      }
      await page.getByRole('checkbox', { name: /Confirmo las licencias/ }).check()
      await page.getByRole('button', { name: 'Pagar y suscribirme con Redsys' }).click()
      await page.getByRole('heading', { name: 'Estamos comprobando el pago' }).waitFor()
    }
    await submit(true)
    assert.equal(paymentAttempts, 1)
    await page.goto(origin + '/presupuestos?pago=ok')
    await page.getByRole('heading', { name: 'Estamos comprobando el pago' }).waitFor()
    assert.equal(businessRequests, 0)
    await settlePayment(false)
    await page.getByText('El último pago no se completó.', { exact: false }).waitFor()
    await page.getByRole('checkbox', { name: 'Añadir Trabajadores' }).check()
    await page.getByRole('checkbox', { name: 'Añadir Asistente de IA' }).check()
    await submit(false)
    await settlePayment(true)
    reference = (await value('select public.company_onboarding_status($1)', [tenant]))
      .booking_reference
    await page.getByRole('heading', { name: 'Reserva tu sesión de puesta en marcha' }).waitFor()
    await page.goto(origin + '/trabajadores')
    await page.getByRole('heading', { name: 'Reserva tu sesión de puesta en marcha' }).waitFor()
    const slotLink = page.getByRole('link', { name: /Ver horas disponibles/ })
    assert.match(await slotLink.getAttribute('href'), new RegExp(reference))
    assert.equal(businessRequests, 0)
    await page.screenshot({ path: join(tmpdir(), 'abaco-dev45-booking.png'), fullPage: true })
    const payload = {
      triggerEvent: 'BOOKING_CREATED',
      payload: {
        status: 'ACCEPTED',
        eventTypeId: 42,
        uid: 'fixture-cal-uid',
        startTime: new Date(Date.now() + 86400000).toISOString(),
        responses: { abaco_reference: { value: reference } },
        attendees: [{ email: user.email }],
      },
    }
    const raw = JSON.stringify(payload)
    const signature = createHmac('sha256', 'fixture-only').update(raw).digest('hex')
    assert.equal(validCalSignature(raw, signature, 'fixture-only'), true)
    assert.equal(validCalSignature(raw + ' ', signature, 'fixture-only'), false)
    const confirmation = bookingConfirmation(payload, '42')
    assert.ok(confirmation)
    const confirm = (emails) =>
      value('select public.confirm_onboarding_booking($1,$2,$3,$4)', [
        confirmation.p_reference,
        confirmation.p_booking_uid,
        confirmation.p_appointment_at,
        emails,
      ])
    assert.equal(await confirm(['other@example.test']), false)
    assert.equal(await value('select public.tenant_can_write($1)', [tenant]), false)
    assert.equal(await confirm(confirmation.p_attendee_emails), true)
    assert.equal(await confirm(confirmation.p_attendee_emails), false)
    await page.getByRole('heading', { name: 'Tus primeros pasos' }).waitFor({ timeout: 20000 })
    assert.ok(businessRequests > 0)
    await page.setViewportSize({ width: 1100, height: 640 })
    await page.goto(origin + '/trabajadores')
    await page.getByRole('heading', { name: 'Trabajadores', exact: true }).waitFor()
    await page.getByText('Núria Vila').first().waitFor()
    await page.getByRole('button', { name: 'Importar desde Excel o CSV' }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Proveedores', exact: true }).count(), 0)
    await page.screenshot({ path: join(tmpdir(), 'abaco-module-workers.png') })
    showcase = true // Separate visual fixture for a module not purchased in this scenario.
    await page.goto(origin + '/proveedores')
    await page.getByRole('heading', { name: 'Proveedores', exact: true }).waitFor()
    await page.getByText('Materials Montseny').waitFor()
    await page.screenshot({ path: join(tmpdir(), 'abaco-module-procurement.png') })
    await page.goto(origin + '/')
    await page.getByRole('button', { name: 'Asistente', exact: true }).click()
    await page.getByRole('heading', { name: 'Asistente de Ábaco' }).waitFor()
    await page.screenshot({ path: join(tmpdir(), 'abaco-module-ai.png') })
    // A separate tenant granted explicit courtesy by the platform bypasses the paid flow.
    courtesy = true
    tenant = await value("select public.create_company('Empresa de cortesía')")
    await db.query('update public.tenants set is_complimentary=true where id=$1', [tenant])
    assert.equal(await value('select public.tenant_can_write($1)', [tenant]), true)
    assert.equal(
      (await value('select public.company_onboarding_status($1)', [tenant])).stage,
      'complete',
    )
    await page.goto(origin + '/')
    await page.getByRole('heading', { name: /Hola, Empresa de cortesía/ }).waitFor()
    assert.equal(paymentAttempts, 2)
    process.stdout.write(
      'PASS: create company → choose modules → seats + annual price → pay on mocked hosted page → fail + retry → confirmed payment with deep-link gate → booking confirmation → workspace, and courtesy account without checkout; desktop + 390px mobile\n',
    )
  } finally {
    await browser.close()
    await db.close()
  }
})().catch((err) => {
  process.stderr.write(`${err.stack ?? String(err)}\n`)
  process.exitCode = 1
})
