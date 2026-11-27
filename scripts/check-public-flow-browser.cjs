// Use a fixture build: VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture
// Start vite preview --port 4179; PLAYWRIGHT_MODULE=/path/to/playwright node scripts/check-public-flow-browser.cjs
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = 'http://127.0.0.1:4179'
const fixture = 'http://localhost:54399'
const catalog = [
  {
    plan: 'standard',
    seats: 1,
    monthly_cents: 2900,
    yearly_cents: 29000,
    seat_monthly_cents: 800,
    vat_percent: 21,
    plan_info: { name: 'Ábaco', audience: 'Fixture', benefit: 'Fixture', revision: 1 },
  },
]

async function run() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  try {
    for (const width of [320, 390, 1280]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 1280 ? 900 : 490 },
        isMobile: width !== 1280,
        hasTouch: width !== 1280,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      })
      let mutations = 0
      let brokenCatalog = width === 1280
      await context.route('**/*', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.origin === origin) return route.continue()
        if (url.origin !== fixture) return route.abort()
        const json = (value, status = 200) =>
          route.fulfill({
            json: value,
            status,
            headers: {
              'access-control-allow-origin': '*',
              'access-control-allow-methods': 'GET, OPTIONS',
              'access-control-allow-headers': '*',
            },
          })
        if (request.method() === 'OPTIONS') return json(null)
        if (request.method() !== 'GET') {
          mutations += 1
          return json({}, 400)
        }
        if (url.pathname.endsWith('/billing_catalog'))
          return brokenCatalog
            ? json({ message: 'Fallo simulado', code: '500' }, 500)
            : json(catalog)
        if (url.pathname.endsWith('/billing_module_catalog'))
          return json([{ code: 'ai', monthly_cents: 375, yearly_cents: 4500 }])
        return json([])
      })
      const page = await context.newPage()
      await page.goto(origin + '/precios')
      await page.getByRole('heading', { name: 'Configura tu plan' }).waitFor()
      const noOverflow = async () => {
        const sizes = await page.locator('html').evaluate((el) => [el.scrollWidth, el.clientWidth])
        assert.equal(sizes[0], sizes[1])
      }
      const retry = page.getByRole('button', { name: 'Reintentar' })
      if (brokenCatalog) {
        await retry.waitFor()
        brokenCatalog = false
        await retry.click()
      }
      await page.getByText(/290(?:,00)?\s*€/).waitFor()
      assert.ok(
        await page.getByText('Dos meses de ahorro en la cuota base.', { exact: false }).isVisible(),
      )
      assert.equal(await page.getByText('Ábaco', { exact: true }).count(), 0)
      await page.getByRole('radio', { name: 'Mensual' }).check()
      await page.getByText(/^29(?:,00)?\s*€$/).waitFor()
      await page.getByRole('button', { name: 'Añadir una plaza' }).click()
      await page.getByText(/^37(?:,00)?\s*€$/).waitFor()
      await page.getByRole('radio', { name: 'Anual' }).check()
      await page.getByText(/^386(?:,00)?\s*€$/).waitFor()
      await noOverflow()
      if (width !== 1280) {
        const cdp = await context.newCDPSession(page)
        await page.evaluate(() => window.scrollTo(0, 0))
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: 110, y: 412 }],
        })
        for (const y of [365, 300, 222, 149, 85]) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: 110, y }],
          })
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await page.waitForFunction(() => window.scrollY > 100)
      }
      await page.getByText('Ver módulos opcionales', { exact: true }).click()
      await page.getByText('Asistente de IA', { exact: true }).waitFor()
      await page.getByText('¿Cuándo se renueva? ¿Y si quiero cancelar?', { exact: true }).click()
      await page.getByText(/El plan se renueva al acabar cada periodo/).waitFor()
      const animation = await page
        .locator('.flow-enter')
        .first()
        .evaluate((el) => getComputedStyle(el).animationName)
      assert.equal(animation, 'none')
      if (width === 390 || width === 1280) {
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: join(tmpdir(), `ml-precios-${width}.png`), fullPage: true })
      }
      await page.getByRole('link', { name: 'Crear mi cuenta' }).click()
      await page.getByRole('heading', { name: 'Empecemos por ti' }).waitFor()
      await page.getByText('Paso 1 de 3', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Continuar', exact: true }).click()
      await page.getByRole('alert').waitFor()
      await page.getByLabel('Tu nombre').fill('Nora Pruebas')
      await page.getByRole('button', { name: 'Continuar', exact: true }).click()
      const name = page.getByLabel('Nombre de la empresa')
      await name.fill('Taller de pruebas')
      await page.getByRole('button', { name: 'Continuar', exact: true }).click()
      await page.getByRole('heading', { name: 'Crea tu acceso' }).waitFor()
      await page.getByText('Paso 3 de 3', { exact: true }).waitFor()
      await page.getByRole('link', { name: 'Ver precios' }).waitFor()
      await noOverflow()
      if (width === 390)
        await page.screenshot({ path: join(tmpdir(), 'ml-registro-390.png'), fullPage: true })
      await page.getByRole('button', { name: 'Volver', exact: true }).click()
      assert.equal(await name.inputValue(), 'Taller de pruebas')
      assert.equal(mutations, 0)
      await context.close()
      process.stdout.write(
        `PASS: public pricing/mobile scroll → three-step registration, no mutations (${width}px).\n`,
      )
    }
  } finally {
    await browser.close()
  }
}
run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
