import type { IncomingMessage, ServerResponse } from 'node:http'

import { createClient } from '@supabase/supabase-js'

import { createAiHandler } from '../server/ai/http.js'
import { aiConfig } from '../server/ai/provider-config.js'
import { generateSuggestion } from '../server/ai/provider.js'
import { reply } from '../server/visit-report-pdf/http.js'

export const config = { api: { bodyParser: false } }

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const { APP_ORIGIN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
  const config = aiConfig(process.env)
  if (!APP_ORIGIN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !config)
    return reply(response, 503, { error: 'not_configured' })
  try {
    const origin = new URL(APP_ORIGIN)
    if (origin.protocol !== 'https:' || origin.origin !== APP_ORIGIN)
      return reply(response, 503, { error: 'not_configured' })
  } catch {
    return reply(response, 503, { error: 'not_configured' })
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return createAiHandler({
    origin: APP_ORIGIN,
    authenticate: async (token) => {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    reserve: async (tenantId, userId, task) => {
      const { data, error } = await admin.rpc('reserve_ai_request', {
        p_tenant: tenantId,
        p_user: userId,
        p_task: task,
      })
      if (error || (data !== 'allowed' && data !== 'forbidden' && data !== 'limit'))
        throw new Error('reservation_unavailable')
      return data
    },
    generate: (input) => generateSuggestion(input, config),
  })(request, response)
}
