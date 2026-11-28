// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Vite preview --host 127.0.0.1 --port 4185; PLAYWRIGHT_MODULE=/path/to/playwright node this-file.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4185'
const supabase = 'http://localhost:54399'
const id = (n) => `ab620000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = id(1)
const worker = id(2)
const visit = id(3)
const before = id(4)
const after = id(5)
const latestBefore = id(6)
const other = id(7)
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date())
const fixtureImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7cAAAAASUVORK5CYII=',
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
    const context = await browser.newContext({
      viewport: { width: 320, height: 740 },
      serviceWorkers: 'block',
    })
    const user = {
      id: worker,
      email: 'worker@example.test',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
    }
    const exp = Math.floor(Date.now() / 1000) + 3600
    const payload = Buffer.from(JSON.stringify({ sub: worker, exp })).toString('base64url')
    await context.addInitScript(
      (session) => localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)),
      {
        user,
        access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,
        refresh_token: 'fixture',
        expires_at: exp,
      },
    )

    const pathFor = (photoId, ext = 'jpg') => `${tenant}/${visit}/${photoId}.${ext}`
    const rows = [
      {
        id: before,
        phase: 'before',
        caption: 'Avería inicial',
        storage_path: pathFor(before),
        created_at: `${today}T08:00:00Z`,
      },
      {
        id: after,
        phase: 'after',
        caption: 'Reparación lista',
        storage_path: pathFor(after),
        created_at: `${today}T09:00:00Z`,
      },
      {
        id: latestBefore,
        phase: 'before',
        caption: 'Otro ángulo al inicio',
        storage_path: pathFor(latestBefore),
        created_at: `${today}T08:30:00Z`,
      },
      {
        id: other,
        phase: 'other',
        caption: 'Etiqueta de serie',
        storage_path: pathFor(other),
        created_at: `${today}T09:10:00Z`,
      },
    ]
    let pairs = []
    let closed = false
    let failPair = true
    let pairReadsFail = false
    const commands = []
    const uploads = []
    const registrations = []
    await context.route('**/*', async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== supabase) return route.abort()
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': '*',
      }
      const send = (json, status = 200) => route.fulfill({ json, status, headers })
      if (req.method() === 'OPTIONS') return send(null)
      if (url.pathname.startsWith('/storage/v1/object/sign/visit-photos/')) {
        if (req.method() === 'POST') {
          return send({
            signedURL: url.pathname.slice('/storage/v1'.length) + '?token=signed-fixture',
          })
        }
        assert.equal(url.searchParams.get('token'), 'signed-fixture')
        assert.equal(url.searchParams.size, 1)
        return route.fulfill({ body: fixtureImage, contentType: 'image/png', headers })
      }
      if (url.pathname.startsWith('/storage/v1/object/visit-photos/') && req.method() === 'POST') {
        const expected = url.pathname.slice('/storage/v1/object/visit-photos/'.length)
        assert.ok(expected.startsWith(`${tenant}/${visit}/`))
        assert.equal(url.search, '')
        const payloadBuffer = req.postDataBuffer()
        assert.ok(payloadBuffer?.includes(fixtureImage))
        uploads.push(expected)
        return send({ Key: `visit-photos/${expected}` })
      }
      const name = url.pathname.split('/').at(-1)
      if (name === 'user') return send(user)
      if (name === 'my_company_memberships')
        return send([{ tenant_id: tenant, company_name: 'Empresa de prueba', role: 'user' }])
      if (
        name === 'company_onboarding_status' ||
        name === 'service_visit_reports' ||
        name === 'service_visit_report_versions'
      )
        return send(null)
      if (name === 'tenant_can_write') return send(true)
      if (name === 'is_platform_superadmin') return send(false)
      if (name === 'my_assigned_visits') {
        const { p_from, p_to, p_tenant_id } = req.postDataJSON()
        assert.equal(p_tenant_id, tenant)
        return send(
          p_from <= today && p_to >= today
            ? [
                {
                  id: visit,
                  title: 'Visita de fotos de prueba',
                  client_name: 'Cliente ficticio',
                  location_name: '',
                  address: '',
                  timezone: 'Europe/Madrid',
                  status: closed ? 'completed' : 'in_progress',
                  scheduled_start_at: `${today}T08:00:00Z`,
                  scheduled_end_at: `${today}T10:00:00Z`,
                  updated_at: `${today}T08:30:00Z`,
                },
              ]
            : [],
        )
      }
      if (name === 'service_visit_photos') {
        assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
        assert.equal(url.searchParams.get('visit_id'), `eq.${visit}`)
        return send(rows)
      }
      if (name === 'service_visit_photo_pairs') {
        assert.equal(url.searchParams.get('tenant_id'), `eq.${tenant}`)
        assert.equal(url.searchParams.get('visit_id'), `eq.${visit}`)
        return pairReadsFail
          ? send({ message: 'Parejas no disponibles (fixture)' }, 500)
          : send(pairs)
      }
      if (name === 'set_service_visit_photo_pair') {
        const data = req.postDataJSON()
        assert.equal(data.p_tenant_id, tenant)
        assert.equal(data.p_visit_id, visit)
        assert.equal(data.p_before_photo_id, before)
        assert.equal(data.p_after_photo_id, after)
        commands.push(data)
        if (failPair) {
          failPair = false
          return send({ message: 'Conexión perdida (fixture)' }, 500)
        }
        pairs = data.p_paired
          ? [{ before_photo_id: before, after_photo_id: after, created_at: `${today}T09:30:00Z` }]
          : []
        return send(null)
      }
      if (name === 'register_service_visit_photo') {
        const data = req.postDataJSON()
        registrations.push(data)
        assert.equal(data.p_tenant_id, tenant)
        assert.equal(data.p_visit_id, visit)
        assert.equal(data.p_phase, 'other')
        assert.equal(data.p_caption, 'Etiqueta adicional de prueba')
        rows.push({
          id: data.p_photo_id,
          phase: data.p_phase,
          caption: data.p_caption,
          storage_path: pathFor(data.p_photo_id, 'png'),
          created_at: `${today}T11:00:00Z`,
        })
        return send(data.p_photo_id)
      }
      return send([])
    })

    const page = await context.newPage()
    page.setDefaultTimeout(12_000)
    await page.goto(`${origin}/mi-jornada`)
    const detail = page.getByRole('article', { name: 'Visita de fotos de prueba' })
    const gallery = detail.getByRole('region', { name: 'Galería de fotografías' })
    const beforeGroup = gallery.getByRole('region', { name: 'Antes', exact: true })
    const bundle = gallery.getByRole('region', { name: 'Parejas antes y después' })
    await detail.getByRole('button', { name: 'Abrir parte' }).click()
    await beforeGroup.getByText('Otro ángulo al inicio', { exact: true }).waitFor()
    const beforeLabels = () => beforeGroup.locator('figcaption').allTextContents()
    assert.match((await beforeLabels())[0], /Otro ángulo al inicio/)
    await gallery.getByLabel('Orden de la galería').selectOption('oldest')
    assert.match((await beforeLabels())[0], /Avería inicial/)
    await gallery.getByRole('combobox', { name: 'Foto de antes', exact: true }).selectOption(before)
    await gallery
      .getByRole('combobox', { name: 'Foto de después', exact: true })
      .selectOption(after)
    const save = gallery.getByRole('button', { name: 'Guardar pareja' })
    await save.focus()
    await page.keyboard.press('Enter')
    await gallery.getByText(/No se pudo actualizar la pareja/).waitFor()
    await save.click()
    await bundle.getByText('Avería inicial', { exact: true }).waitFor()
    await bundle.getByText('Reparación lista', { exact: true }).waitFor()
    await page.waitForFunction(
      (photoId) => document.activeElement?.id === `before-after-photo-pair-${photoId}`,
      before,
    )
    assert.deepEqual(commands[0], commands[1])
    assert.deepEqual(uploads, [])
    assert.deepEqual(registrations, [])

    const noOverflow = async () => {
      const [full, viewport] = await page
        .locator('#main-content')
        .evaluate((el) => [el.scrollWidth, el.clientWidth])
      assert.ok(full <= viewport + 1, `Horizontal overflow: ${full}/${viewport}`)
    }
    await noOverflow()
    await page.reload()
    await detail.getByRole('button', { name: 'Abrir parte' }).click()
    await bundle.getByText('Reparación lista', { exact: true }).waitFor()
    await bundle.getByRole('button', { name: /Separar pareja/ }).click()
    await bundle.waitFor({ state: 'hidden' })
    await beforeGroup.getByText('Avería inicial', { exact: true }).waitFor()
    assert.equal(commands[2].p_paired, false)
    assert.equal(rows.length, 4)

    const camera = detail.getByLabel('Hacer foto', { exact: true })
    const picker = detail.getByLabel('Elegir una imagen', { exact: true })
    assert.equal(await camera.getAttribute('capture'), 'environment')
    assert.equal(await picker.getAttribute('capture'), null)
    await picker.setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: fixtureImage })
    await detail.getByRole('combobox', { name: 'Momento', exact: true }).selectOption('other')
    await detail.getByLabel('Descripción de la imagen').fill('Etiqueta adicional de prueba')
    await detail.getByRole('button', { name: 'Preparar fotografía' }).click()
    const manual = detail.getByRole('button', { name: 'Enviar fixture.png' })
    await manual.waitFor()
    assert.equal(uploads.length, 0)
    await manual.click()
    await gallery.getByText('Etiqueta adicional de prueba', { exact: true }).waitFor()
    assert.equal(uploads.length, 1)
    assert.equal(registrations.length, 1)

    pairReadsFail = true
    await page.reload()
    await detail.getByRole('button', { name: 'Abrir parte' }).click()
    await gallery
      .getByText('No se pudieron cargar las parejas. Las fotografías siguen disponibles.', {
        exact: true,
      })
      .waitFor()
    await gallery.getByText('Avería inicial', { exact: true }).waitFor()
    pairReadsFail = false
    await gallery.getByRole('button', { name: 'Reintentar parejas' }).click()
    await gallery.getByRole('button', { name: 'Guardar pareja' }).waitFor()

    closed = true
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.reload()
    await detail.getByRole('button', { name: 'Ver parte' }).click()
    await gallery.getByText('Avería inicial', { exact: true }).waitFor()
    assert.equal(await gallery.getByRole('button', { name: 'Guardar pareja' }).count(), 0)
    assert.equal(await camera.count(), 0)
    await noOverflow()
    process.stdout.write(
      'Visit photo gallery smoke: capture choice, manual upload, phases, keyboard pairing, retry, persistence, sorting and read-only closure.\n',
    )
  } finally {
    await browser.close()
  }
}
run().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
})
