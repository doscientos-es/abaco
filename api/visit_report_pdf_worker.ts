import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { reply } from '../server/visit-report-pdf/http'
import { SupabaseReportStore } from '../server/visit-report-pdf/upstream'
import { processOnePdfJob } from '../server/visit-report-pdf/worker'

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') return reply(response, 405, { status: 'method_not_allowed' })
  const secret = process.env.CRON_SECRET
  const received = Buffer.from(request.headers.authorization ?? '')
  const expected = Buffer.from(`Bearer ${secret ?? ''}`)
  if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return reply(response, 401, { status: 'unauthorized' })
  }
  const base = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) return reply(response, 503, { status: 'not_configured' })
  try {
    return reply(response, 200, {
      status: await processOnePdfJob(new SupabaseReportStore(base, key)),
    })
  } catch {
    return reply(response, 502, { status: 'unavailable' })
  }
}
