import type { IncomingMessage, ServerResponse } from 'node:http'

import { beginStripeAuthorization } from '../server/stripe-connect/oauth'
import { oauthEnvironment, setStateCookie } from '../server/stripe-connect/oauth-http'
import { canManageStripe, createStripeOAuthStore } from '../server/stripe-connect/oauth-store'
import { readJson, reply } from '../server/visit-report-pdf/http'

export const config = { api: { bodyParser: false } }

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') return reply(response, 405, { error: 'method_not_allowed' })
  const env = oauthEnvironment()
  if (!env) return reply(response, 503, { error: 'not_configured' })
  if (request.headers.origin !== env.origin) return reply(response, 403, { error: 'forbidden' })
  const authorization = request.headers.authorization ?? ''
  if (!authorization.startsWith('Bearer ')) return reply(response, 401, { error: 'unauthorized' })
  const { data, error } = await env.admin.auth.getUser(authorization.slice(7))
  if (error || !data.user) return reply(response, 401, { error: 'unauthorized' })
  let input: unknown
  try {
    input = await readJson(request, 4096)
  } catch {
    return reply(response, 400, { error: 'invalid_input' })
  }
  const tenantId = input && typeof input === 'object' && 'tenantId' in input ? input.tenantId : null
  if (
    typeof tenantId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)
  )
    return reply(response, 400, { error: 'invalid_input' })
  try {
    const actor = { tenantId, userId: data.user.id }
    if (!(await canManageStripe(env.admin, actor)))
      return reply(response, 403, { error: 'forbidden' })
    const url = await beginStripeAuthorization(
      actor,
      env.config,
      createStripeOAuthStore(env.admin),
      (current) => canManageStripe(env.admin, current),
    )
    const state = new URL(url).searchParams.get('state')
    if (!state) throw new Error('Missing state')
    setStateCookie(response, state)
    return reply(response, 200, { url })
  } catch {
    return reply(response, 503, { error: 'unavailable' })
  }
}
