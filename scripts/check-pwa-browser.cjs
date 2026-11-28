// With a built local preview: PLAYWRIGHT_MODULE=/path/to/playwright node scripts/check-pwa-browser.cjs
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const sharp = require('sharp')

const origin = process.env.PWA_URL || 'http://127.0.0.1:4196'

async function run() {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    ...(process.env.CHROMIUM_RESTRICTED === '1'
      ? { args: ['--no-zygote', '--single-process', '--disable-gpu'] }
      : {}),
  })
  try {
    for (const width of [320, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 820 } })
      const page = await context.newPage()
      await page.goto(`${origin}/entrar`)
      await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor()
      assert.equal(await page.title(), 'Menos Líos · un producto de Doscientos')
      assert.equal(
        await page.getByText('Menos Líos', { exact: true }).filter({ visible: true }).count(),
        1,
      )
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width)
      assert.equal(
        await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'),
        'Menos Líos',
      )
      const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
      const cdp = await context.newCDPSession(page)
      const { data } = await cdp.send('Page.getAppManifest')
      const manifest = JSON.parse(data)
      assert.equal(manifest.id, '/')
      assert.equal(manifest.name, 'Menos Líos')
      assert.equal(manifest.short_name, 'Menos Líos')
      assert.equal(manifest.display, 'standalone')
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
      assert.deepEqual(installabilityErrors, [])

      for (const icon of [...manifest.icons, { src: apple, sizes: '180x180', purpose: 'apple' }]) {
        const response = await context.request.get(`${origin}${icon.src}`)
        assert.equal(response.ok(), true)
        assert.match(response.headers()['content-type'], /^image\/png/)
        const image = sharp(await response.body())
        const { width: size, height } = await image.metadata()
        assert.equal(`${size}x${height}`, icon.sizes)
        if (icon.purpose === 'maskable' || icon.purpose === 'apple') {
          const { data: pixels, info } = await image
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
          assert.deepEqual([...pixels.subarray(0, 4)], [42, 66, 39, 255])
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const index = (y * size + x) * info.channels
              assert.equal(pixels[index + 3], 255)
              if (pixels[index] > 50) {
                assert.ok(Math.hypot(x - size / 2, y - size / 2) <= size * 0.4)
              }
            }
          }
        }
      }

      await context.setOffline(true)
      await page.reload()
      await page.getByText('Sin conexión.', { exact: true }).waitFor()
      assert.equal(await page.title(), 'Menos Líos · un producto de Doscientos')
      const cachedManifest = await page.evaluate(async () =>
        (await fetch('/manifest.webmanifest')).json(),
      )
      assert.equal(cachedManifest.name, 'Menos Líos')
      await context.close()
      process.stdout.write(
        `PWA OK: ${width}px, Chromium installability, app and Apple icons, offline reload\n`,
      )
    }
  } finally {
    await browser.close()
  }
}
run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
