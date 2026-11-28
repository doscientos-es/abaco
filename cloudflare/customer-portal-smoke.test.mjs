import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { test } from 'node:test'

const token = 'b'.repeat(64)
const digest = createHash('sha256').update(token).digest('hex')

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server.address().port
}

void test(
  'the deployed Worker layout isolates the portal and forwards only the digest',
  { timeout: 45_000 },
  async () => {
    const calls = []
    const document = { closedAt: '2026-10-23T12:00:00Z', version: 2, checksTotal: 2, checksDone: 1 }
    const serveFixture = async (request, response) => {
      if (
        request.url !== '/rest/v1/rpc/read_client_portal_grant' ||
        request.headers.authorization !== 'Bearer fixture-only'
      ) {
        response.writeHead(404).end()
        return
      }
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const input = JSON.parse(Buffer.concat(chunks).toString())
      calls.push(input)
      const grant =
        input.p_token_hash === digest
          ? {
              expiresAt: '2099-12-01T18:00:00Z',
              sourceNote: 'private',
              visits: [],
              documents: [{ ...document, storage: 'private/storage' }],
            }
          : null
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(grant))
    }
    const db = createServer((request, response) => {
      void serveFixture(request, response).catch(() => response.writeHead(500).end())
    })
    const dbPort = await listen(db)
    const portProbe = createServer()
    const port = await listen(portProbe)
    await new Promise((resolve) => portProbe.close(resolve))
    const base = `http://127.0.0.1:${port}`
    const worker = spawn(
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
        '--var',
        `SUPABASE_URL:http://127.0.0.1:${dbPort}`,
        '--var',
        'SUPABASE_SERVICE_ROLE_KEY:fixture-only',
      ],
      {
        env: {
          ...process.env,
          CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
          WRANGLER_SEND_METRICS: 'false',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    )
    let errors = ''
    worker.stderr.on('data', (chunk) => {
      errors = (errors + chunk).slice(-2200)
    })
    try {
      let portal
      for (let time = 0; time < 120; time++) {
        if (worker.exitCode !== null) throw new Error(`Local Worker failed: ${errors}`)
        try {
          portal = await fetch(`${base}/portal-cliente`, { signal: AbortSignal.timeout(1_000) })
          break
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 200))
        }
      }
      assert.ok(portal, 'local Worker did not start')
      assert.equal(portal.status, 200)
      assert.equal(portal.headers.get('cache-control'), 'no-store')
      assert.match(portal.headers.get('x-robots-tag'), /noindex/)
      assert.match(portal.headers.get('content-security-policy'), /connect-src 'self'/)
      assert.match(await portal.text(), /id="portal-root"/)
      const lookup = (key) =>
        fetch(`${base}/api/customer_portal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: key }),
        })
      const denied = await lookup('a'.repeat(64))
      assert.equal(denied.status, 404)
      assert.deepEqual(await denied.json(), { error: 'not_found' })
      const allowed = await lookup(token)
      assert.equal(allowed.status, 200)
      assert.equal(allowed.headers.get('cache-control'), 'no-store')
      const received = await allowed.json()
      assert.deepEqual(received.documents, [document])
      assert.equal(Object.hasOwn(received, 'sourceNote'), false)
      assert.deepEqual(calls[1], { p_token_hash: digest })
    } finally {
      worker.kill()
      await new Promise((resolve) => db.close(resolve))
    }
  },
)
