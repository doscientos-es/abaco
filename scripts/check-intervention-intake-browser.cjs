// Run against Vite at 4194. All destinations except the fixture page and same-origin mock API are blocked.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:4194'
const token = 'a'.repeat(64)
const image = Buffer.from(
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
    const context = await browser.newContext({
      viewport: { width: 320, height: 740 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    })
    const writes = []
    const otherOrigin = []
    const secureURLs = []
    await context.route('**/*', async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      assert.equal(req.url().includes(token), false)
      if (url.origin !== origin) {
        otherOrigin.push(url.origin)
        return route.abort()
      }
      if (!url.pathname.startsWith('/api/')) return route.continue()
      secureURLs.push(url.pathname)
      const json = (data, status = 200) => route.fulfill({ json: data, status })
      assert.equal(req.headers()['x-request-invitation'], token)
      if (url.pathname.endsWith('/check')) {
        assert.deepEqual(req.postDataJSON(), {})
        return json({ available: true })
      }
      writes.push({
        body: req.postDataJSON(),
        operationId: req.headers()['x-request-operation'],
        mode: req.headers()['x-request-photo-mode'],
      })
      if (writes.length === 1) return json({ error: 'photo_quota' }, 503)
      if (writes.length === 2) return json({ error: 'photo_unavailable' }, 503)
      if (writes.length === 3) return json({ error: 'try_again' }, 503)
      return json({ receipt: 'fixture-confirmation' })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    page.setDefaultNavigationTimeout(45000)
    await page.goto(`${origin}/solicitud.html#${token}`)
    const address = page.getByRole('textbox', { name: 'Dirección de la intervención' })
    const availability = page.getByRole('textbox', { name: 'Disponibilidad aproximada' })
    const consent = page.getByRole('checkbox', { name: /Autorizo el envío/ })
    const submit = page.getByRole('button', { name: 'Enviar una solicitud' })
    await address.waitFor()
    assert.equal(new URL(page.url()).hash, '')
    await address.fill('Calle Ficticia 19')
    await availability.fill('Jueves por la tarde')
    await page
      .getByLabel('Fotos opcionales')
      .setInputFiles({ name: 'mock.png', mimeType: 'image/png', buffer: image })
    await page.getByRole('img', { name: /Vista previa local/ }).waitFor()
    assert.equal(writes.length, 0)
    assert.equal(await submit.isDisabled(), true)
    await consent.press('Space')
    assert.equal(await consent.isChecked(), true)
    await submit.press('Enter')
    await page
      .getByRole('alert')
      .filter({ hasText: /límite de uso/ })
      .waitFor()
    await page.getByRole('img', { name: /Vista previa local/ }).waitFor()
    assert.equal(await address.inputValue(), 'Calle Ficticia 19')
    await submit.press('Enter')
    await page
      .getByRole('alert')
      .filter({ hasText: /no está disponible ahora/ })
      .waitFor()
    assert.deepEqual(writes[0], writes[1])
    assert.equal(writes[0].mode, 'photos')
    assert.equal(writes[0].body.photos.length, 1)
    await page.getByRole('button', { name: 'Quitar foto 1' }).press('Enter')
    assert.equal(await consent.isChecked(), false)
    assert.equal(await submit.isDisabled(), true)
    assert.equal(writes.length, 2)
    await consent.press('Space')
    await page.keyboard.press('Tab')
    assert.equal(await submit.evaluate((e) => e === document.activeElement), true)
    const sizes = await page.locator('main').evaluate((e) => [e.scrollWidth, e.clientWidth])
    assert.ok(sizes[0] <= sizes[1] + 1)
    await page.keyboard.press('Enter')
    await page
      .getByRole('alert')
      .filter({ hasText: /No se pudo confirmar/ })
      .waitFor()
    assert.equal(await address.inputValue(), 'Calle Ficticia 19')
    await submit.press('Enter')
    await page.getByRole('region', { name: 'Solicitud recibida' }).waitFor()
    assert.equal(await page.getByRole('textbox').count(), 0)
    assert.equal(writes.length, 4)
    assert.deepEqual(writes[2], writes[3])
    assert.equal(writes[2].mode, 'text')
    assert.notEqual(writes[2].operationId, writes[0].operationId)
    assert.deepEqual(writes[2].body, {
      address: 'Calle Ficticia 19',
      availability: 'Jueves por la tarde',
      confirm: true,
      photos: [],
    })
    assert.deepEqual(secureURLs, [
      '/api/intervention-request/check',
      ...Array.from({ length: 4 }, () => '/api/intervention-request/submit'),
    ])
    assert.deepEqual(otherOrigin, [])
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0)
    process.stdout.write(
      'Intervention intake: 320px keyboard, local preview, explicit submission, no-file and retry passed.\n',
    )
  } finally {
    await browser.close()
  }
}
run().catch((e) => {
  process.stderr.write(`${e.stack ?? e}\n`)
  process.exitCode = 1
})
