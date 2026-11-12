import type { IncomingMessage, ServerResponse } from 'node:http'

import { readJson, reply } from '../server/visit-report-pdf/http'
import { createOrGetPdf } from '../server/visit-report-pdf/public'
import { record, SupabaseReportStore, UpstreamError } from '../server/visit-report-pdf/upstream'

export const config = { api: { bodyParser: false } }

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') return reply(response, 405, { error: 'method_not_allowed' })
  let body: unknown
  try {
    body = await readJson(request, 256)
  } catch {
    return reply(response, 400, { error: 'invalid_request' })
  }
  const token = record(body).token
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token))
    return reply(response, 404, { error: 'not_found' })
  const base = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) return reply(response, 503, { error: 'not_configured' })
  try {
    const url = await createOrGetPdf(token, new SupabaseReportStore(base, key))
    return reply(response, 200, { url })
  } catch (error) {
    const status = error instanceof UpstreamError && error.status === 404 ? 404 : 502
    return reply(response, status, { error: status === 404 ? 'not_found' : 'unavailable' })
  }
}
