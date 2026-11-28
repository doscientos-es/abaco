import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { readJson, reply } from '../server/visit-report-pdf/http'
import {
  decodePortalSnapshot,
  portalTokenPattern,
} from '../src/features/clients/domain/customer-portal'

export const config = { api: { bodyParser: false } }

export default async function customerPortal(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return reply(response, 405, { error: 'method_not_allowed' })
  }
  const notFound = () => reply(response, 404, { error: 'not_found' })
  if (
    request.headers['sec-fetch-site'] === 'cross-site' ||
    !request.headers['content-type']?.startsWith('application/json')
  )
    return notFound()
  let body: unknown
  try {
    body = await readJson(request, 120)
  } catch {
    return notFound()
  }
  const token = body && typeof body === 'object' && 'token' in body ? body.token : undefined
  if (typeof token !== 'string' || !portalTokenPattern.test(token)) return notFound()
  const base = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) return reply(response, 503, { error: 'unavailable' })
  try {
    const upstream = await fetch(new URL('/rest/v1/rpc/read_client_portal_grant', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_token_hash: createHash('sha256').update(token).digest('hex') }),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    })
    if (!upstream.ok) return reply(response, 502, { error: 'unavailable' })
    const output: unknown = await upstream.json()
    if (output === null) return notFound()
    const grant = decodePortalSnapshot(output)
    if (!grant) return reply(response, 502, { error: 'unavailable' })
    if (Date.parse(grant.expiresAt) <= Date.now()) return notFound()
    return reply(response, 200, grant)
  } catch {
    return reply(response, 502, { error: 'unavailable' })
  }
}
