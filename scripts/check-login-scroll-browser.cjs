// Build with VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture.
// Serve the build on 4198, then run with PLAYWRIGHT_MODULE and optionally CHROMIUM_PATH.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const origin = process.env.LOGIN_URL || 'http://127.0.0.1:4198'

async function run() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  try {
    for (const { width, height, mobile } of [
      { width: 320, height: 460, mobile: true },
      { width: 667, height: 375, mobile: true },
      { width: 1280, height: 520, mobile: false },
      { width: 1280, height: 900, mobile: false },
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: mobile,
        hasTouch: mobile,
      })
      try {
        const page = await context.newPage()
        await page.goto(`${origin}/entrar`)
        await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor()
        const footer = page.getByRole('link', { name: 'Un producto de Doscientos' })
        assert.equal(await page.locator('.login-brand-panel').isVisible(), !mobile)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width)
        if (height < 600) {
          assert.ok(
            (await footer.boundingBox()).y > height,
            'fixture must put footer below the fold',
          )
        }

        if (mobile) {
          const cdp = await context.newCDPSession(page)
          const x = 12
          for (let swipe = 0; swipe < 3; swipe++) {
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: [{ x, y: height - 24 }],
            })
            for (let y = height - 52; y > 38; y -= 32) {
              await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x, y }],
              })
            }
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
          }
        } else if (height < 600) {
          await page.mouse.move(width * 0.75, height / 2)
          await page.mouse.wheel(0, 900)
        }

        await page.waitForFunction(
          ({ height, mustScroll }) => {
            const links = [
              ...document.querySelectorAll('.login-maker, a[href="/precios"], a[href="/registro"]'),
            ]
            return (
              links.length === 3 &&
              (!mustScroll || window.scrollY > 0) &&
              links.every((link) => {
                const box = link.getBoundingClientRect()
                return box.top >= -1 && box.bottom <= height + 1
              })
            )
          },
          { height, mustScroll: height < 600 },
          { timeout: 3500 },
        )
        process.stdout.write(
          `Login footer and signup/pricing links are reachable at ${width}×${height}\n`,
        )
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
