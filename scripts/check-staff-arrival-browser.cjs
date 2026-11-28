// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// pnpm exec vite preview --host 127.0.0.1 --port 4185, then execute this script with Playwright.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4185'
const fakeSupabase = 'http://localhost:54399'
const id = (value) => `ab580000-0000-4000-8000-${String(value).padStart(12, '0')}`
const tenant = id(1)
const client = id(2)
const location = id(3)
const visit = id(4)
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date())

async function run() {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    ...(process.env.CHROMIUM_RESTRICTED === '1'
      ? { args: ['--no-zygote', '--single-process', '--disable-gpu'] }
      : {}),
  })
  let row = null
  let version = 0
  let protocol = null
  let protocolError = false
  const protocolWrites = []
  const workerLookups = []
  const writes = []

  async function as(role, viewport) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' })
    const user = {
      id: role === 'admin' ? id(5) : id(6),
      email: `${role}@example.test`,
      aud: 'authenticated',
      user_metadata: {},
      app_metadata: {},
    }
    const exp = Math.floor(Date.now() / 1000) + 3600
    const payload = Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url')
    await context.addInitScript(
      (session) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)),
      {
        access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,
        refresh_token: 'fixture',
        expires_at: exp,
        user,
      },
    )
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== fakeSupabase) return route.abort()
      const send = (json, status = 200) =>
        route.fulfill({
          json,
          status,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
            'access-control-allow-headers': '*',
          },
        })
      if (request.method() === 'OPTIONS') return send(null)
      const name = url.pathname.split('/').at(-1)
      if (
        role === 'user' &&
        [
          'clients',
          'client_contacts',
          'service_locations',
          'service_location_staff_arrival',
          'service_location_protocol_versions',
        ].includes(name)
      ) {
        workerLookups.push(name)
      }
      if (name === 'my_company_memberships')
        return send([{ tenant_id: tenant, company_name: 'Empresa Ficticia', role }])
      if (name === 'company_onboarding_status') return send(null)
      if (name === 'tenant_can_write') return send(true)
      if (name === 'is_platform_superadmin') return send(false)
      if (name === 'user') return send(user)
      if (name === 'tenants') return send([{ id: tenant, name: 'Empresa Ficticia' }])
      if (name === 'clients')
        return send([{ id: client, tenant_id: tenant, name: 'Cliente Ficticio' }])
      if (name === 'service_locations')
        return send([
          {
            id: location,
            tenant_id: tenant,
            client_id: client,
            name: 'Recepción de pruebas',
            address: 'Calle Ficticia 3',
            kind: 'service',
            active: true,
            operational_contact: 'Contacto privado fixture',
            access_notes: 'Datos internos fixture',
          },
        ])
      if (name === 'service_location_staff_arrival') {
        assert.equal(role, 'admin')
        if (request.method() === 'GET') return send(row)
        const next = request.postDataJSON()
        if (request.method() === 'PATCH')
          assert.equal(url.searchParams.get('updated_at'), `eq.${row.updated_at}`)
        else assert.equal(next.location_id, location)
        writes.push(next)
        row = { ...row, ...next, updated_at: `2026-11-28T14:00:0${++version}Z` }
        return send({ updated_at: row.updated_at })
      }
      if (name === 'service_location_protocol_versions') {
        assert.equal(role, 'admin')
        assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
        assert.equal(url.searchParams.get('location_id'), `eq.${location}`)
        assert.equal(url.searchParams.get('select'), 'revision,items,shared')
        return send(protocol)
      }
      if (name === 'save_service_location_protocol') {
        assert.equal(role, 'admin')
        const next = request.postDataJSON()
        protocolWrites.push(next)
        assert.equal(next.p_tenant, tenant)
        assert.equal(next.p_location, location)
        assert.equal(next.p_expected, protocol?.revision ?? 0)
        assert.match(next.p_operation, /^[0-9a-f-]{36}$/)
        if (next.p_shared) assert.equal(next.p_reviewed, true)
        protocol = { revision: next.p_expected + 1, items: next.p_items, shared: next.p_shared }
        return send(protocol.revision)
      }
      if (name === 'list_assigned_visit_protocols') {
        assert.equal(role, 'user')
        assert.deepEqual(request.postDataJSON(), { p_tenant: tenant, p_visit_ids: [visit] })
        if (protocolError) return send({ message: 'Fixture unavailable' }, 400)
        return send(
          protocol?.shared
            ? [
                {
                  visit_id: visit,
                  revision: protocol.revision,
                  items: protocol.items,
                  state: 'changed',
                  changed_items: protocol.items.slice(-1),
                  removed_count: 1,
                },
              ]
            : [],
        )
      }
      if (name === 'my_assigned_visits') {
        const { p_from, p_to, p_tenant_id } = request.postDataJSON()
        assert.equal(p_tenant_id, tenant)
        return send(
          p_from <= today && today <= p_to
            ? [
                {
                  id: visit,
                  title: 'Visita de prueba de llegada',
                  client_name: 'Cliente Ficticio',
                  location_name: 'Recepción de pruebas',
                  address: 'Calle Ficticia 3',
                  status: 'scheduled',
                  timezone: 'Europe/Madrid',
                  scheduled_start_at: `${today}T13:00:00Z`,
                  scheduled_end_at: `${today}T14:00:00Z`,
                  updated_at: `${today}T12:00:00Z`,
                },
              ]
            : [],
        )
      }
      if (name === 'list_assigned_visit_arrivals') {
        assert.equal(role, 'user')
        assert.deepEqual(request.postDataJSON(), { p_tenant_id: tenant, p_visit_ids: [visit] })
        return send(
          row && (row.share_directions || row.share_contact)
            ? [
                {
                  visit_id: visit,
                  instructions: row.share_directions ? row.instructions : null,
                  parking: row.share_directions ? row.parking : null,
                  contact_label: row.share_contact ? row.contact_label : null,
                  contact_phone: row.share_contact ? row.contact_phone : null,
                },
              ]
            : [],
        )
      }
      return send([])
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    return page
  }

  async function fits(locator) {
    const [scroll, client] = await locator.evaluate((element) => [
      element.scrollWidth,
      element.clientWidth,
    ])
    assert.ok(scroll <= client + 1, `Horizontal overflow: ${scroll}/${client}`)
  }

  try {
    const office = await as('admin', { width: 320, height: 740 })
    await office.goto(`${origin}/clientes/${client}`)
    const open = office.getByRole('button', {
      name: 'Llegada para técnicos en Recepción de pruebas',
    })
    const dialog = office.getByRole('dialog', { name: /Llegada para técnicos/ })
    const save = dialog.getByRole('button', { name: 'Guardar ficha' })
    const enter = dialog.getByRole('textbox', { name: 'Indicaciones de entrada' })
    const parking = dialog.getByRole('textbox', { name: 'Aparcamiento' })
    const directions = dialog.getByRole('checkbox', { name: 'Compartir entrada y aparcamiento' })
    const contact = dialog.getByRole('checkbox', { name: 'Compartir este teléfono operativo' })
    const review = dialog.getByRole('checkbox', { name: /He revisado/ })
    await open.click()
    await enter.fill('Entrada norte, pregunta en recepción.')
    await parking.fill('Plazas marcadas para visitas.')
    await dialog
      .getByRole('textbox', { name: 'Nombre o función del contacto' })
      .fill('Control de acceso')
    await dialog.getByRole('textbox', { name: 'Teléfono de trabajo' }).fill('+34 612 345 678')
    assert.equal(await directions.isChecked(), false)
    assert.equal(await contact.isChecked(), false)
    await fits(dialog)
    await save.click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(writes[0].share_directions, false)
    assert.equal(writes[0].share_contact, false)
    assert.equal(writes[0].contact_phone, '+34612345678')

    const worker = await as('user', { width: 320, height: 740 })
    const workerCard = worker
      .getByRole('article', { name: 'Visita de prueba de llegada' })
      .getByRole('region', { name: 'Ficha de llegada' })
    async function readWorker(reload = false) {
      await Promise.all([
        worker.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/list_assigned_visit_arrivals') && response.ok(),
        ),
        reload ? worker.reload() : worker.goto(`${origin}/mi-jornada`),
      ])
      await workerCard.waitFor()
      await fits(worker.locator('#main-content'))
    }
    await readWorker()
    assert.equal(await workerCard.getByText('Entrada', { exact: true }).count(), 0)
    assert.equal(await workerCard.getByRole('link', { name: /Llamar/ }).count(), 0)

    await open.click()
    await directions.check()
    await contact.check()
    assert.equal(await save.isDisabled(), true)
    await review.check()
    await save.click()
    await dialog.waitFor({ state: 'hidden' })
    await readWorker(true)
    await workerCard.getByText('Entrada norte, pregunta en recepción.', { exact: true }).waitFor()
    await workerCard.getByText('Plazas marcadas para visitas.', { exact: true }).waitFor()
    const phone = workerCard.getByRole('link', { name: 'Llamar a Control de acceso' })
    assert.equal(await phone.getAttribute('href'), 'tel:+34612345678')
    const map = workerCard.getByRole('link', { name: /Cómo llegar/ })
    assert.equal(
      new URL(await map.getAttribute('href')).searchParams.get('destination'),
      'Calle Ficticia 3',
    )
    assert.equal(await workerCard.getByText(/Contacto privado|Datos internos/).count(), 0)

    const openProtocol = office.getByRole('button', {
      name: 'Protocolo operativo de Recepción de pruebas',
    })
    const protocolDialog = office.getByRole('dialog', { name: /Protocolo · Recepción/ })
    const workerProtocol = worker.getByRole('region', { name: 'Protocolo del centro' })
    const reloadProtocol = async (ok = true) => {
      await Promise.all([
        worker.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/list_assigned_visit_protocols') && response.ok() === ok,
        ),
        worker.reload(),
      ])
    }
    await openProtocol.press('Enter')
    await protocolDialog
      .getByRole('textbox', { name: 'Indicación 1' })
      .fill('Prepara el equipo antes de empezar.')
    await protocolDialog
      .getByRole('textbox', { name: 'Indicación 2' })
      .fill('Comprueba el cuadro al terminar.')
    const share = protocolDialog.getByRole('checkbox', { name: 'Compartir con personal asignado' })
    await fits(protocolDialog)
    assert.equal(await share.isChecked(), false)
    const saveDraft = protocolDialog.getByRole('button', { name: 'Guardar borrador' })
    assert.equal(await saveDraft.isDisabled(), true)
    await protocolDialog.getByRole('checkbox', { name: /Confirmo/ }).press('Space')
    await saveDraft.press('Enter')
    await protocolDialog.waitFor({ state: 'hidden' })
    await reloadProtocol()
    assert.equal(await workerProtocol.count(), 0)
    assert.equal(protocolWrites.length, 1)
    await openProtocol.press('Enter')
    await share.press('Space')
    const publish = protocolDialog.getByRole('button', { name: 'Compartir protocolo' })
    assert.equal(await publish.isDisabled(), true)
    await protocolDialog.getByRole('checkbox', { name: /Confirmo/ }).press('Space')
    await publish.press('Enter')
    await protocolDialog.waitFor({ state: 'hidden' })
    await reloadProtocol()
    await workerProtocol.getByText('Cambió desde tu última visita registrada.').waitFor()
    await workerProtocol.getByText('Nueva indicación').waitFor()
    await workerProtocol.getByText('Se retiró una indicación anterior.').waitFor()
    assert.equal(await workerProtocol.getByText(/Datos internos|Contacto privado/).count(), 0)
    await fits(worker.locator('#main-content'))
    protocolError = true
    await reloadProtocol(false)
    await worker.getByText('No se pudieron consultar los protocolos de centro.').waitFor()
    assert.equal(await workerProtocol.count(), 0)
    protocolError = false
    await worker.getByRole('button', { name: 'Reintentar protocolos' }).press('Enter')
    await workerProtocol.getByText('Nueva indicación').waitFor()
    await office.setViewportSize({ width: 1280, height: 900 })
    await openProtocol.press('Enter')
    await fits(protocolDialog)
    await share.press('Space')
    await protocolDialog.getByRole('button', { name: 'Retirar protocolo' }).press('Enter')
    await protocolDialog.waitFor({ state: 'hidden' })
    await reloadProtocol()
    await workerProtocol.waitFor({ state: 'hidden' })
    assert.equal(protocolWrites.length, 3)

    await open.click()
    await contact.uncheck()
    await save.click()
    await dialog.waitFor({ state: 'hidden' })
    await worker.setViewportSize({ width: 1280, height: 900 })
    await readWorker(true)
    await workerCard.getByText('Entrada norte, pregunta en recepción.', { exact: true }).waitFor()
    assert.equal(await phone.count(), 0)
    assert.deepEqual(workerLookups, [])
    process.stdout.write(
      'Staff arrival smoke: default off, office consent gates, assigned preview, opt-out, centre protocol draft/share/retry/withdrawal and no tenant-wide contact or protocol reads.\n',
    )
  } finally {
    await browser.close()
  }
}
run().catch((reason) => {
  process.stderr.write(`${reason.stack || reason}\n`)
  process.exitCode = 1
})
