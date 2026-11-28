// Requires a local Vite server using the synthetic Supabase URL, never a hosted project:
// VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_PUBLISHABLE_KEY=fixture pnpm exec vite --port 4197
// PLAYWRIGHT_MODULE=playwright [CHROMIUM_PATH=/path/to/chromium] node scripts/check-visit-dictation-browser.cjs
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:4197'
const fakeSupabase = 'http://localhost:54399'
const id = (n) => `63000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const tenant = id(1)
const sourceId = id(20)
const user = {
  id: id(2),
  email: 'tecnica@example.test',
  user_metadata: { full_name: 'Técnica de prueba' },
  app_metadata: { provider: 'email' },
  aud: 'authenticated',
}
const expires = Math.floor(Date.now() / 1000) + 3600
const session = {
  access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString('base64url')}.fixture`,
  refresh_token: 'fixture',
  expires_at: expires,
  expires_in: 3600,
  user,
}
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date())
const source = {
  id: sourceId,
  title: 'Primera visita',
  client_name: 'Cliente ficticio',
  location_name: 'Centro ficticio',
  address: 'Calle ficticia 15',
  scheduled_start_at: `${today}T08:00:00Z`,
  scheduled_end_at: `${today}T09:00:00Z`,
  timezone: 'Europe/Madrid',
  updated_at: `${today}T07:00:00Z`,
  status: 'in_progress',
}
const startingNotes = 'Nota anterior sin cambiar.'
const rejectedTranscript = 'Texto sin revisar'
const approvedTranscript = 'Texto revisado y correcto'

async function run() {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    ...(process.env.CHROMIUM_RESTRICTED === '1'
      ? { args: ['--no-zygote', '--single-process', '--disable-gpu'] }
      : {}),
  })
  try {
    const context = await browser.newContext({
      viewport: { width: 320, height: 700 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    })
    await context.addInitScript(
      ({ fixture, transcript }) => {
        localStorage.setItem('sb-localhost-auth-token', JSON.stringify(fixture))
        const stats = { checks: [], starts: [], stops: 0, aborts: 0 }
        window.speechFixture = { stats, availability: 'available', outcome: 'normal' }
        class LocalMock {
          processLocally = false
          static async available(options) {
            stats.checks.push(options)
            if (window.speechFixture.availability === 'error') throw new Error('Policy fixture')
            if (window.speechFixture.availability === 'pending')
              return new Promise((resolve) => (window.speechFixture.finishCheck = resolve))
            return window.speechFixture.availability
          }
          start() {
            stats.starts.push({ processLocally: this.processLocally, language: this.lang })
            if (window.speechFixture.outcome === 'permission') {
              queueMicrotask(() => this.onerror?.({ error: 'not-allowed' }))
              return
            }
            queueMicrotask(() => this.onstart?.())
          }
          stop() {
            stats.stops++
            window.speechFixture.finishSpeech = () => {
              this.onresult?.({
                results: [
                  Object.assign([{ transcript: 'Interim descartado' }], { isFinal: false }),
                  Object.assign([{ transcript }], { isFinal: true }),
                ],
              })
              this.onend?.()
            }
          }
          abort() {
            stats.aborts++
          }
        }
        const remoteOnly = class {
          static available(options) {
            return LocalMock.available(options)
          }
          start() {
            stats.starts.push('REMOTE START MUST NEVER RUN')
          }
        }
        window.speechFixture.useLocal = () => (window.SpeechRecognition = LocalMock)
        window.speechFixture.useRemoteOnly = () => (window.SpeechRecognition = remoteOnly)
        window.speechFixture.useRemoteOnly()
        window.webkitSpeechRecognition = remoteOnly
      },
      { fixture: session, transcript: rejectedTranscript },
    )
    const writes = []
    let report = {
      visit_id: sourceId,
      tenant_id: tenant,
      data: { notes: startingNotes, checklist: [], next_actions: '', recommendations: '' },
      revision: 1,
      updated_at: `${today}T07:00:00Z`,
      updated_by: user.id,
    }
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== fakeSupabase) return route.abort()
      const json = (value) =>
        route.fulfill({
          json: value,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': '*',
          },
        })
      if (request.method() === 'OPTIONS') return json(null)
      const name = url.pathname.split('/').at(-1)
      if (name === 'my_company_memberships')
        return json([{ tenant_id: tenant, company_name: 'Empresa de pruebas', role: 'user' }])
      if (name === 'company_onboarding_status') return json(null)
      if (name === 'tenant_can_write') return json(true)
      if (name === 'is_platform_superadmin') return json(false)
      if (name === 'my_assigned_visits') {
        const args = request.postDataJSON()
        return json(args.p_from <= today && today <= args.p_to ? [source] : [])
      }
      if (name === 'service_visit_reports') return json(report)
      if (name === 'list_service_visit_handoffs')
        return json({
          can_create: true,
          can_resolve: true,
          has_scope: true,
          incoming: [],
          incoming_has_more: false,
          outgoing: [],
        })
      if (name === 'save_service_visit_report') {
        const args = request.postDataJSON()
        writes.push(args)
        report = { ...report, data: args.p_data, revision: report.revision + 1 }
        return json(report.revision)
      }
      return json([])
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    await page.clock.setFixedTime(new Date(`${today}T08:30:00Z`))
    await page.goto(`${origin}/mi-jornada`)
    const visit = page.getByRole('article').filter({ hasText: source.title })
    await visit.getByRole('button', { name: 'Abrir parte' }).press('Enter')
    const notes = visit.getByRole('textbox', { name: 'Notas del técnico' })
    await page.waitForFunction(
      (value) =>
        document.querySelector('textarea[aria-label="Notas del técnico"]')?.value === value,
      startingNotes,
    )
    assert.equal(await notes.inputValue(), startingNotes)
    const show = visit.getByRole('button', { name: 'Dictar notas' })
    const panel = visit.getByRole('region', { name: 'Dictado de notas' })
    const preview = panel.getByRole('textbox', { name: 'Vista previa del dictado' })
    const check = panel.getByRole('button', { name: /comprobar/i })
    const start = panel.getByRole('button', { name: 'Iniciar dictado en español' })
    const stop = panel.getByRole('button', { name: 'Detener dictado' })
    const discard = panel.getByRole('button', { name: 'Cerrar y descartar' })
    const append = panel.getByRole('button', { name: 'Añadir a las notas' })
    const stat = (name) => page.evaluate((key) => window.speechFixture.stats[key], name)

    // Opening is intentionally passive. A remote-only implementation doesn't even get queried.
    await show.press('Enter')
    assert.deepEqual(await stat('checks'), [])
    await page.keyboard.press('Tab')
    assert.equal(await check.evaluate((element) => element === document.activeElement), true)
    await page.keyboard.press('Space')
    await panel.getByText('Este navegador no ofrece dictado local.').waitFor()
    assert.deepEqual(await stat('checks'), [])
    assert.deepEqual(await stat('starts'), [])
    await panel.getByText(/micrófono de tu teclado/).waitFor()
    await preview.fill('Borrador con el teclado')
    await discard.press('Enter')
    assert.equal(await notes.inputValue(), startingNotes)
    assert.equal(await show.evaluate((element) => element === document.activeElement), true)

    // The Spanish availability probe fails closed and does not install languages or start.
    await page.evaluate(() => {
      window.speechFixture.useLocal()
      window.speechFixture.availability = 'downloadable'
    })
    await page.keyboard.press('Enter')
    await check.press('Enter')
    await panel.getByText(/paquete de español/).waitFor()
    assert.deepEqual(await stat('checks'), [{ langs: ['es-ES'], processLocally: true }])
    assert.deepEqual(await stat('starts'), [])
    await page.evaluate(() => (window.speechFixture.availability = 'error'))
    await check.press('Enter')
    await panel.getByText('No se pudo comprobar el dictado local.').waitFor()

    // Closing during a pending check prevents its delayed result from arming the microphone.
    await page.evaluate(() => (window.speechFixture.availability = 'pending'))
    await check.press('Enter')
    await panel.getByText(/Comprobando si el español/).waitFor()
    await discard.press('Enter')
    await page.evaluate(() => {
      window.speechFixture.finishCheck('available')
      window.speechFixture.availability = 'available'
      window.speechFixture.outcome = 'permission'
    })
    await show.press('Enter')
    assert.equal(await start.count(), 0)
    await check.press('Enter')
    await start.waitFor()
    assert.deepEqual(await stat('starts'), [])
    await start.press('Enter')
    await panel.getByText(/No hay permiso para usar el micrófono/).waitFor()
    assert.deepEqual(await stat('starts'), [{ processLocally: true, language: 'es-ES' }])

    // Successful dictation goes to an editable transient preview only.
    await page.evaluate(() => (window.speechFixture.outcome = 'normal'))
    await check.press('Enter')
    await start.press('Enter')
    await panel.getByText(/Escuchando en español/).waitFor()
    await stop.press('Enter')
    await panel.getByText(/Procesando el texto en tu dispositivo/).waitFor()
    assert.equal(await append.isDisabled(), true)
    await page.evaluate(() => window.speechFixture.finishSpeech())
    await panel.getByText(/Dictado terminado/).waitFor()
    assert.equal(await preview.inputValue(), rejectedTranscript)
    assert.equal(await notes.inputValue(), startingNotes)
    assert.equal(
      await page.evaluate(
        (value) => Object.values(localStorage).some((v) => v.includes(value)),
        rejectedTranscript,
      ),
      false,
    )
    assert.equal(writes.length, 0)

    await preview.fill('á'.repeat(4000))
    await panel
      .getByRole('alert')
      .filter({ hasText: /notas no pueden superar/ })
      .waitFor()
    assert.equal(await append.isDisabled(), true)
    await preview.fill(approvedTranscript)
    const [scroll, client] = await panel.evaluate((element) => [
      element.scrollWidth,
      element.clientWidth,
    ])
    assert.ok(scroll <= client + 1, `Horizontal overflow: ${scroll}/${client}`)
    await preview.press('Tab')
    assert.equal(await append.evaluate((element) => element === document.activeElement), true)
    await page.keyboard.press('Enter')
    assert.equal(await notes.inputValue(), `${startingNotes}\n${approvedTranscript}`)
    assert.equal(writes.length, 0)
    await visit.getByRole('button', { name: 'Guardar parte' }).press('Enter')
    await page.getByText('Parte guardado en la empresa', { exact: true }).waitFor()
    assert.equal(writes.length, 1)
    assert.equal(writes[0].p_data.notes, `${startingNotes}\n${approvedTranscript}`)

    // Leaving/unmounting the editor stops the microphone; no provider or cloud route is used.
    await show.press('Enter')
    await check.press('Enter')
    await start.press('Enter')
    await panel.getByText(/Escuchando en español/).waitFor()
    const before = await stat('aborts')
    await visit.getByRole('button', { name: 'Ocultar parte' }).press('Enter')
    await panel.waitFor({ state: 'detached' })
    assert.equal(await stat('aborts'), before + 1)
    assert.equal(writes.length, 1)
    await context.close()
    process.stdout.write(
      'Visit dictation: local-only gating, permissions, editor save, teardown & 320px keyboard passed.\n',
    )
  } finally {
    await browser.close()
  }
}
run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
