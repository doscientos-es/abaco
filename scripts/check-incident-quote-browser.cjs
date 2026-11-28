// VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture pnpm exec vite --port 4195
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4195'
const supabase = 'http://localhost:54399'
const id = (n) => `77000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = id(1)
const client = id(2)
const centre = id(3)
const photoId = id(4)
const otherPhoto = id(5)
const visit = id(6)
const finding = id(7)
const estimate = id(8)
const actor = {
  id: id(9),
  email: 'office@example.test',
  aud: 'authenticated',
  user_metadata: {},
  app_metadata: {},
}
const timestamp = '2026-11-28T13:00:00Z'
const clientRow = { id: client, tenant_id: tenant, name: 'Cliente de prueba' }
const location = {
  id: centre,
  client_id: client,
  tenant_id: tenant,
  name: 'Centre Nord',
  address: 'Calle 1',
  kind: 'service',
  active: true,
}
const photos = [
  { id: photoId, caption: 'Foto apta para referencia', phase: 'before' },
  { id: otherPhoto, caption: 'Otra imagen', phase: 'other' },
]
const sharedContext = {
  client_id: client,
  centre_id: centre,
  centre_name: location.name,
  centre_address: location.address,
  visit_id: visit,
}
const storedPath = `${tenant}/${visit}/${photoId}.png`
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2YQAAAAASUVORK5CYII=',
  'base64',
)

async function run() {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    ...(process.env.CHROMIUM_RESTRICTED === '1'
      ? { args: ['--no-zygote', '--single-process', '--disable-gpu'] }
      : {}),
  })
  try {
    const browserContext = await browser.newContext({
      viewport: { width: 320, height: 740 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    })
    const expires = Math.floor(Date.now() / 1000) + 3600
    const jwt = Buffer.from(JSON.stringify({ sub: actor.id, exp: expires })).toString('base64url')
    await browserContext.addInitScript(
      (session) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)),
      {
        access_token: `eyJhbGciOiJIUzI1NiJ9.${jwt}.fixture`,
        refresh_token: 'fixture',
        expires_at: expires,
        user: actor,
      },
    )
    const submissions = []
    const unexpected = []
    let photoSigns = 0
    let row = null
    await browserContext.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== supabase) return route.abort()
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': '*',
        'access-control-expose-headers': 'content-range',
        'content-range': '0-0/1',
      }
      const json = (data, status = 200) => route.fulfill({ json: data, headers, status })
      if (request.method() === 'OPTIONS') return json(null)
      const name = url.pathname.split('/').at(-1)
      if (url.pathname.includes('/storage/v1/object/sign/visit-photos/')) {
        if (request.method() === 'POST') {
          photoSigns++
          assert.ok(url.pathname.endsWith(storedPath))
          return json({ signedURL: `/object/sign/visit-photos/${storedPath}?token=fixture` })
        }
        return route.fulfill({ headers, contentType: 'image/png', body: png })
      }
      if (name === 'my_company_memberships')
        return json([{ tenant_id: tenant, company_name: 'Empresa de pruebas', role: 'admin' }])
      if (name === 'company_onboarding_status') return json(null)
      if (name === 'tenant_can_write') return json(true)
      if (name === 'is_platform_superadmin') return json(false)
      if (name === 'user') return json(actor)
      if (name === 'tenants') return json([{ id: tenant, name: 'Empresa de pruebas' }])
      if (name === 'clients') return json(url.searchParams.has('id') ? clientRow : [clientRow])
      if (name === 'service_locations') return json([location])
      if (name === 'estimates') return json(row ? [row] : [])
      if (name === 'service_incident_conversions')
        return json(
          row
            ? [
                {
                  kind: 'estimate',
                  estimate_id: estimate,
                  operation_id: submissions[0].p_operation_id,
                },
              ]
            : [],
        )
      if (name === 'service_incidents')
        return json([
          {
            id: finding,
            client_id: client,
            location_id: centre,
            source_visit_id: visit,
            title: 'Hallazgo pendiente',
            description: 'Diagnóstico interno, no compartir',
            priority: 'normal',
            status: 'open',
            coverage_kind: 'unassessed',
            diagnosis: '',
            resolution: '',
            created_at: timestamp,
            updated_at: timestamp,
          },
        ])
      if (name === 'get_incident_quote_review')
        return json({
          ...sharedContext,
          client_name: clientRow.name,
          incident_version: timestamp,
          photos,
        })
      if (name === 'service_visit_photos') {
        assert.equal(url.searchParams.get('id'), `eq.${photoId}`)
        assert.equal(url.searchParams.get('visit_id'), `eq.${visit}`)
        return json({ storage_path: storedPath })
      }
      if (name === 'create_incident_quote_draft') {
        const args = request.postDataJSON()
        submissions.push(args)
        assert.equal(args.p_incident_id, finding)
        assert.equal(args.p_client_id, client)
        assert.equal(args.p_centre_id, centre)
        assert.equal(args.p_incident_version, timestamp)
        assert.deepEqual(args.p_photo_ids, [photoId])
        assert.deepEqual(args.p_lines, ['Verificar la unidad'])
        assert.ok(!JSON.stringify(args).includes(storedPath))
        if (submissions.length === 1) return json({ code: '503' }, 503)
        assert.equal(args.p_operation_id, submissions[0].p_operation_id)
        row = {
          id: estimate,
          tenant_id: tenant,
          client_id: client,
          status: 'draft',
          document_format: 'table',
          number: 'P-2026-999',
          title: args.p_title,
          vat_rate: 21,
          valid_until: '2026-12-15',
          created_at: timestamp,
          estimate_lines: [
            {
              id: id(10),
              description: args.p_lines[0],
              kind: 'other',
              unit: 'ud',
              quantity: 1,
              unit_price_cents: 0,
              position: 0,
            },
          ],
          estimate_milestones: [],
        }
        return json(estimate)
      }
      if (name === 'get_incident_quote_draft_context')
        return json({ ...sharedContext, photos: [photos[0]] })
      if (
        request.method() === 'POST' &&
        /publish|send_estimate|convert_service_incident/.test(name)
      )
        unexpected.push(name)
      return json([])
    })
    const page = await browserContext.newPage()
    page.setDefaultTimeout(20000)
    page.setDefaultNavigationTimeout(45000)
    await page.goto(`${origin}/clientes/${client}`)
    const trigger = page.getByRole('button', { name: 'Preparar presupuesto' })
    await trigger.press('Enter')
    const review = page.getByRole('region', { name: 'Revisar borrador de presupuesto' })
    await review.getByText(location.name, { exact: true }).waitFor()
    const submit = review.getByRole('button', { name: 'Crear borrador sin enviar' })
    const photo = review.getByRole('checkbox', { name: 'Referenciar foto 1 solo internamente' })
    const other = review.getByRole('checkbox', { name: 'Referenciar foto 2 solo internamente' })
    assert.equal(await submit.isDisabled(), true)
    assert.equal(await photo.isDisabled(), true)
    assert.equal(photoSigns, 0)
    await review
      .getByRole('textbox', { name: 'Partidas pendientes de valorar' })
      .fill('Verificar la unidad')
    await review.getByRole('button', { name: 'Ver foto privada 1' }).press('Enter')
    await review.getByRole('img', { name: /Evidencia operativa/ }).waitFor()
    await photo.and(page.locator('input:not([disabled])')).waitFor()
    await photo.press('Space')
    assert.equal(await photo.isChecked(), true)
    assert.equal(await other.isChecked(), false)
    assert.equal(photoSigns, 1)
    assert.equal(await submit.isDisabled(), true)
    const confirm = review.getByRole('checkbox', { name: /He revisado el cliente/ })
    await confirm.press('Space')
    await page.keyboard.press('Tab')
    assert.equal(await submit.evaluate((button) => button === document.activeElement), true)
    const widths = await review.evaluate((el) => [el.scrollWidth, el.clientWidth])
    assert.ok(widths[0] <= widths[1] + 1, `overflow ${widths}`)
    await page.keyboard.press('Enter')
    await review
      .getByRole('alert')
      .filter({ hasText: /No se pudo confirmar/ })
      .waitFor()
    await submit.press('Enter')
    await page.waitForURL(`**/presupuestos/${estimate}`)
    const privateContext = page.getByRole('region', {
      name: 'Hallazgo de origen · Información interna',
    })
    await privateContext.getByText(photos[0].caption, { exact: true }).waitFor()
    assert.equal(await privateContext.getByText(photos[1].caption, { exact: true }).count(), 0)
    await privateContext.getByText(/Hay partidas pendientes de valorar/).waitFor()
    assert.equal(photoSigns, 1)
    assert.deepEqual(unexpected, [])
    assert.equal(submissions.length, 2)
    await page.getByRole('button', { name: 'Diseño y vista previa' }).press('Enter')
    await privateContext.waitFor({ state: 'detached' })
    assert.equal(await page.getByText(photos[0].caption, { exact: true }).count(), 0)
    process.stdout.write(
      'Incident quote: explicit review, private opt-in photo, retry, draft-only and 320px keyboard passed.\n',
    )
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  process.stderr.write(`${e.stack ?? e}\n`)
  process.exitCode = 1
})
