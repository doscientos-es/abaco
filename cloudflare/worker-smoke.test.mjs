import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'

import Stripe from 'stripe'

const secret = 'whsec_test_only'
const event = {
  id: 'evt_ABC123',
  object: 'event',
  account: 'acct_ABC123',
  livemode: false,
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_ABC123' } },
}
const payload = JSON.stringify(event)
const signature = new Stripe('sk_test_placeholder').webhooks.generateTestHeaderString({
  payload,
  secret,
})

let mock
let worker
let probe
let workerUrl
let probeUrl
const events = []
const requests = []
const tenant = '5c000000-0000-4000-8000-000000000001'
const versionId = '5c000000-0000-4000-8000-000000000002'
const visit = '5c000000-0000-4000-8000-000000000003'
const lease = '5c000000-0000-4000-8000-000000000004'
const photo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWNYffb96rPvGSAUAEJCCZ0WY1CJAAAAAElFTkSuQmCC',
  'base64',
)
let uploadedPdf
let completedJob
let invalidPhoto = false
let failWebhook = false
let mockError

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server.address().port
}

async function freePort() {
  const server = createServer()
  const port = await listen(server)
  await new Promise((resolve) => server.close(resolve))
  return port
}

function startWorker(port, args) {
  return spawn(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'dev',
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--show-interactive-dev-session=false',
      ...args,
    ],
    {
      env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' },
      stdio: 'ignore',
    },
  )
}

async function waitUntilReady(url, child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error('Wrangler stopped before starting')
    try {
      await fetch(`${url}/api/not_found`)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error('Wrangler did not start')
}

before(
  async () => {
    const handleMockRequest = async (request, response) => {
      const path = new URL(request.url, 'http://localhost').pathname
      requests.push(`${request.method} ${path}`)
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = Buffer.concat(chunks)
      const json = (data) =>
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(data))
      if (path === '/rest/v1/rpc/receive_stripe_connect_event') {
        if (failWebhook) return response.writeHead(500).end()
        events.push(JSON.parse(body.toString()))
        return json(null)
      }
      if (path === '/rest/v1/service_visit_report_shares') {
        return json([
          {
            tenant_id: tenant,
            report_version_id: versionId,
            expires_at: '2099-01-01T00:00:00Z',
            revoked_at: null,
          },
        ])
      }
      if (path === '/rest/v1/rpc/claim_service_visit_report_pdf_job') {
        return json([{ tenant_id: tenant, report_version_id: versionId, lease_token: lease }])
      }
      if (path === '/rest/v1/rpc/finish_service_visit_report_pdf_job') {
        completedJob = JSON.parse(body.toString())
        return json(true)
      }
      if (path === '/rest/v1/service_visit_report_versions') {
        return json([
          {
            version: 1,
            closed_at: '2026-10-23T12:00:00Z',
            snapshot: {
              company: { name: 'Test' },
              client: { name: 'Test' },
              visit: { id: visit, title: 'Test' },
              report: { data: {} },
              photos: [{ storage_path: `${tenant}/${visit}/image.png`, phase: 'before' }],
            },
          },
        ])
      }
      if (path === `/storage/v1/object/authenticated/visit-photos/${tenant}/${visit}/image.png`) {
        return response
          .writeHead(200, { 'content-type': 'image/png' })
          .end(invalidPhoto ? 'invalid' : photo)
      }
      if (path === `/storage/v1/object/info/visit-report-pdfs/${tenant}/${versionId}.pdf`) {
        return response.writeHead(uploadedPdf ? 200 : 404).end()
      }
      if (path === `/storage/v1/object/sign/visit-report-pdfs/${tenant}/${versionId}.pdf`) {
        return json({ signedURL: '/object/sign/visit-report-pdfs/example.pdf?token=test' })
      }
      if (path === `/storage/v1/object/visit-report-pdfs/${tenant}/${versionId}.pdf`) {
        uploadedPdf = body
        return json({})
      }
      response.writeHead(404).end()
    }
    mock = createServer((request, response) => {
      void handleMockRequest(request, response).catch((error) => {
        mockError = error
        response.destroy(error)
      })
    })
    const mockPort = await listen(mock)
    const port = await freePort()
    const probePort = await freePort()
    workerUrl = `http://127.0.0.1:${port}`
    probeUrl = `http://127.0.0.1:${probePort}`
    worker = startWorker(port, [
      '--var',
      'STRIPE_SECRET_KEY:sk_test_placeholder',
      '--var',
      `STRIPE_CONNECT_WEBHOOK_SECRET:${secret}`,
      '--var',
      'STRIPE_CONNECT_MODE:test',
      '--var',
      'STRIPE_CLIENT_ID:ca_Test123',
      '--var',
      `SUPABASE_URL:http://127.0.0.1:${mockPort}`,
      '--var',
      'SUPABASE_SERVICE_ROLE_KEY:test-only',
      '--var',
      'CRON_SECRET:test-only',
      '--var',
      'APP_ORIGIN:https://app.example.test',
      '--var',
      'GEMINI_API_KEY:test-only',
    ])
    probe = startWorker(probePort, ['--config', 'cloudflare/wrangler.probe.jsonc'])
    await Promise.all([waitUntilReady(workerUrl, worker), waitUntilReady(probeUrl, probe)])
  },
  { timeout: 60000 },
)

after(async () => {
  worker?.kill()
  probe?.kill()
  if (mock?.listening) await new Promise((resolve) => mock.close(resolve))
  if (mockError) throw mockError
})

void test('Worker routes protect endpoints and do not serve the SPA for unknown APIs', async () => {
  assert.equal((await fetch(`${workerUrl}/api/not_found`)).status, 404)
  assert.equal((await fetch(`${workerUrl}/api/stripe_connect_authorize`)).status, 405)
  assert.equal(
    (await fetch(`${workerUrl}/api/visit_report_pdf_worker`, { method: 'POST' })).status,
    401,
  )
  for (const name of ['ai_chat', 'ai_suggestion']) {
    const response = await fetch(`${workerUrl}/api/${name}`, {
      method: 'POST',
      headers: { origin: 'https://app.example.test' },
    })
    assert.equal(response.status, 401)
  }
  const callback = await fetch(`${workerUrl}/api/stripe_connect_callback`, { redirect: 'manual' })
  assert.equal(callback.status, 303)
  assert.match(callback.headers.get('location'), /stripe=error/)
  const pdf = await fetch(`${workerUrl}/api/visit_report_pdf`, {
    method: 'POST',
    body: '{"token":"bad"}',
  })
  assert.equal(pdf.status, 404)
})

void test('Stripe webhook verifies raw bytes and persists before acknowledging', async () => {
  const send = (body) =>
    fetch(`${workerUrl}/api/stripe_connect_webhook`, {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body,
    })
  assert.equal((await send(payload)).status, 200)
  assert.deepEqual(events, [{ p_event: event }])
  assert.equal((await send(`${payload} `)).status, 400)
  assert.equal(events.length, 1)
  failWebhook = true
  assert.equal((await send(payload)).status, 503)
  failWebhook = false
})

void test('workerd renders a PDF with transformed photo evidence', async () => {
  const response = await fetch(probeUrl)
  assert.equal(response.status, 200)
  const pdf = Buffer.from(await response.arrayBuffer())
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.ok(pdf.includes(Buffer.from('/Subtype /Image')))
})

void test('PDF job downloads evidence, uploads the PDF and marks the job ready', async () => {
  const response = await fetch(`${workerUrl}/api/visit_report_pdf_worker`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-only' },
  })
  assert.equal(response.status, 200, `Mock requests: ${requests.join(', ')}`)
  assert.deepEqual(await response.json(), { status: 'ready' })
  assert.equal(uploadedPdf.subarray(0, 5).toString(), '%PDF-')
  assert.ok(uploadedPdf.includes(Buffer.from('/Subtype /Image')))
  assert.deepEqual(completedJob, {
    p_report_version_id: versionId,
    p_lease_token: lease,
    p_ready: true,
    p_error_code: null,
  })
})

void test('public report endpoint reuses and signs a previously generated PDF', async () => {
  const response = await fetch(`${workerUrl}/api/visit_report_pdf`, {
    method: 'POST',
    body: JSON.stringify({ token: 'a'.repeat(64) }),
  })
  assert.equal(response.status, 200)
  assert.match((await response.json()).url, /download=parte-de-visita\.pdf$/)
})

void test('PDF job retries when the photo cannot be transformed', async () => {
  uploadedPdf = undefined
  invalidPhoto = true
  const response = await fetch(`${workerUrl}/api/visit_report_pdf_worker`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-only' },
  })
  assert.deepEqual(await response.json(), { status: 'retry' })
  assert.equal(uploadedPdf, undefined)
  assert.equal(completedJob.p_ready, false)
  assert.equal(completedJob.p_error_code, 'render_failed')
})
