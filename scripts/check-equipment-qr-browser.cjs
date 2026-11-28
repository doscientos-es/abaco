// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Run against vite preview at 4210 with PLAYWRIGHT_MODULE and CHROMIUM_PATH.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:4210'
const supabase = 'http://localhost:54399'
const id = (n) => `ab730000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = id(1)
const client = id(2)
const location = id(3)
const equipment = id(4)
const tags = [id(21), id(22)]
let label = {
  equipment_id: equipment,
  kind: 'Bomba de circulación',
  manufacturer: 'Modelo ficticio',
  model: 'Serie de prueba',
  revision: 0,
  token: null,
}

async function run() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  const changes = []
  let scans = 0
  let workerGetsAssigned = true
  const requestUrls = []
  async function newPage(role, loggedIn, width) {
    const context = await browser.newContext({
      viewport: { width, height: 820 },
      serviceWorkers: 'block',
    })
    const user = {
      id: id(role === 'admin' ? 10 : 11),
      email: `${role}@example.test`,
      aud: 'authenticated',
      user_metadata: {},
      app_metadata: {},
    }
    const exp = Math.floor(Date.now() / 1000) + 3600
    const jwt = Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url')
    const session = {
      user,
      expires_at: exp,
      expires_in: 3600,
      token_type: 'bearer',
      access_token: `eyJhbGciOiJIUzI1NiJ9.${jwt}.fixture`,
      refresh_token: 'fixture',
    }
    if (loggedIn)
      await context.addInitScript(
        (value) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(value)),
        session,
      )
    await context.addInitScript(() => {
      const append = Element.prototype.append
      Element.prototype.append = function (...nodes) {
        append.apply(this, nodes)
        for (const frame of nodes) {
          if (
            !(frame instanceof HTMLIFrameElement) ||
            frame.title !== 'Documento para guardar como PDF' ||
            !frame.contentWindow
          )
            continue
          const printed = frame.contentDocument.body
          frame.contentWindow.print = () => {
            document.documentElement.dataset.printedLabel = JSON.stringify({
              text: printed.textContent.trim(),
              qr: Boolean(printed.querySelector('svg path')),
              links: printed.querySelectorAll('a').length,
            })
          }
        }
      }
    })
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      requestUrls.push(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== supabase) return route.abort()
      const send = (json, status = 200) =>
        route.fulfill({
          json,
          status,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'access-control-allow-headers': '*',
          },
        })
      if (request.method() === 'OPTIONS') return send(null)
      switch (url.pathname.split('/').at(-1)) {
        case 'token':
          assert.equal(url.searchParams.get('grant_type'), 'password')
          return send(session)
        case 'user':
          return send(user)
        case 'my_company_memberships':
          return send([{ tenant_id: tenant, company_name: 'Empresa ficticia', role }])
        case 'company_onboarding_status':
          return send(null)
        case 'tenant_can_write':
        case 'can_use_staff':
          return send(true)
        case 'is_platform_superadmin':
          return send(false)
        case 'tenants':
          return send([{ id: tenant, name: 'Empresa ficticia' }])
        case 'clients':
          assert.equal(role, 'admin')
          return send([{ id: client, tenant_id: tenant, name: 'Cliente privado fixture' }])
        case 'service_locations':
          assert.equal(role, 'admin')
          return send([
            {
              id: location,
              tenant_id: tenant,
              client_id: client,
              name: 'Sala de pruebas',
              address: 'Dirección privada fixture',
              kind: 'service',
              active: true,
            },
          ])
        case 'list_centre_equipment_labels':
          assert.equal(role, 'admin')
          assert.deepEqual(request.postDataJSON(), {
            p_tenant: tenant,
            p_location: location,
            p_offset: 0,
          })
          return send([label])
        case 'change_equipment_label': {
          assert.equal(role, 'admin')
          const p = request.postDataJSON()
          assert.equal(p.p_tenant, tenant)
          assert.equal(p.p_location, location)
          assert.equal(p.p_equipment, equipment)
          assert.equal(p.p_expected, label.revision)
          assert.match(p.p_operation, /^[a-f0-9-]{36}$/)
          changes.push(p.p_action)
          label = {
            ...label,
            revision: label.revision + 1,
            token: p.p_action === 'revoke' ? null : tags[label.revision],
          }
          return send(label.revision)
        }
        case 'scan_equipment_label': {
          const { p_tenant, p_token } = request.postDataJSON()
          assert.equal(p_tenant, tenant)
          scans++
          if (p_token !== label.token || (role === 'user' && !workerGetsAssigned)) return send(null)
          return send({
            kind: label.kind,
            manufacturer: label.manufacturer,
            model: label.model,
            activity: [{ type: 'incident', date: '2026-11-28T08:00:00Z', status: 'open' }],
          })
        }
        default:
          return send([])
      }
    })
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    return { page, context }
  }
  const fits = async (page) =>
    assert.equal(
      await page.locator('html').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      true,
    )

  try {
    const { page: office } = await newPage('admin', true, 320)
    await office.goto(`${origin}/clientes/${client}`)
    await office
      .getByRole('button', { name: 'Etiquetas de equipos en Sala de pruebas' })
      .press('Enter')
    const dialog = office.getByRole('dialog', { name: /Etiquetas QR/ })
    await dialog.getByRole('button', { name: /Etiqueta de Bomba/ }).press('Enter')
    await dialog.getByRole('button', { name: 'Crear etiqueta QR' }).press('Enter')
    const graphic = dialog.getByRole('img', { name: /Código QR/ })
    await graphic.waitFor()
    assert.match(await graphic.getAttribute('viewBox'), /^0 0 [0-9]+ [0-9]+$/)
    assert.ok((await graphic.locator('path').getAttribute('d')).length > 400)
    if (process.env.QR_FIXTURE_PNG) await graphic.screenshot({ path: process.env.QR_FIXTURE_PNG })
    await fits(office)
    const first = await dialog.getByRole('textbox', { name: 'Enlace de la etiqueta' }).inputValue()
    assert.equal(first, `${origin}/equipo-qr#${tags[0]}`)
    assert.equal(
      await dialog.getByRole('link', { name: 'Abrir enlace' }).getAttribute('href'),
      first,
    )
    await dialog.getByRole('button', { name: 'Imprimir etiqueta' }).press('Enter')
    const printed = await office.evaluate(() => {
      const frame = Array.from(document.querySelectorAll('iframe')).find(
        (item) => item.title === 'Documento para guardar como PDF',
      )
      const printBody = frame?.contentDocument?.body
      return {
        text: printBody?.textContent.trim(),
        qr: Boolean(printBody?.querySelector('svg path')),
        links: printBody?.querySelectorAll('a').length,
      }
    })
    assert.deepEqual(printed, { text: 'Equipo · Menos Líos', qr: true, links: 0 })

    const { page: worker, context: workerContext } = await newPage('user', false, 320)
    await worker.goto(first)
    await worker.waitForURL((url) => url.pathname === '/entrar')
    const login = new URL(worker.url())
    assert.equal(login.searchParams.get('redirect'), '/equipo-qr')
    assert.equal(login.hash, `#${tags[0]}`)
    assert.equal(scans, 0)
    await worker.getByRole('textbox', { name: 'Correo' }).fill('user@example.test')
    await worker.getByLabel('Contraseña', { exact: true }).fill('Prueba-no-real-11')
    await worker.getByRole('button', { name: 'Entrar', exact: true }).press('Enter')
    await worker.waitForURL((url) => url.pathname === '/equipo-qr' && url.hash === `#${tags[0]}`)
    await worker.getByRole('heading', { name: 'Bomba de circulación' }).waitFor()
    await worker.getByText('Incidencia abierta', { exact: true }).waitFor()
    assert.equal(await worker.getByText(/Cliente privado|Dirección privada/).count(), 0)
    await fits(worker)
    await workerContext.setOffline(true)
    await worker.getByText('No se pudo abrir esta etiqueta.').waitFor()
    assert.equal(await worker.getByRole('heading', { name: 'Bomba de circulación' }).count(), 0)
    await workerContext.setOffline(false)
    await worker.getByRole('heading', { name: 'Bomba de circulación' }).waitFor()
    workerGetsAssigned = false
    await worker.reload()
    await worker.getByText('No se pudo abrir esta etiqueta.').waitFor()
    assert.equal(await worker.getByRole('heading', { name: 'Bomba de circulación' }).count(), 0)
    workerGetsAssigned = true

    await office.setViewportSize({ width: 1440, height: 820 })
    await dialog.getByRole('button', { name: 'Sustituir etiqueta' }).press('Enter')
    assert.deepEqual(changes, ['issue'])
    await dialog.getByRole('button', { name: 'Confirmar sustitución' }).press('Enter')
    const second = `${origin}/equipo-qr#${tags[1]}`
    await office.waitForFunction(
      (value) =>
        Array.from(document.querySelectorAll('input[readonly]')).some(
          (input) => input.value === value,
        ),
      second,
    )
    assert.equal(
      await dialog.getByRole('textbox', { name: 'Enlace de la etiqueta' }).inputValue(),
      second,
    )
    await fits(office)
    await worker.goto(first)
    await worker.getByText('No se pudo abrir esta etiqueta.').waitFor()
    await worker.goto(second)
    await worker.getByRole('heading', { name: 'Bomba de circulación' }).waitFor()
    await dialog.getByRole('button', { name: 'Retirar etiqueta' }).press('Enter')
    await dialog.getByRole('button', { name: 'Confirmar retirada' }).press('Enter')
    await dialog.getByRole('button', { name: 'Crear etiqueta QR' }).waitFor()
    await worker.reload()
    await worker.getByText('No se pudo abrir esta etiqueta.').waitFor()
    assert.deepEqual(changes, ['issue', 'rotate', 'revoke'])
    assert.equal(
      requestUrls.some((url) => tags.some((tag) => url.includes(tag))),
      false,
    )
    process.stdout.write(
      'Equipment QR: offline encoder, isolated print, password continuation, authorization, offline hiding, rotation and revocation.\n',
    )
  } finally {
    await browser.close()
  }
}
run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
