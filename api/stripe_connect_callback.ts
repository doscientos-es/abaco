import type { IncomingMessage, ServerResponse } from 'node:http'

import { completeStripeAuthorization } from '../server/stripe-connect/oauth'
import {
  clearStateCookie,
  hasMatchingState,
  oauthEnvironment,
  redirectToSettings,
} from '../server/stripe-connect/oauth-http'
import { canManageStripe, createStripeOAuthStore } from '../server/stripe-connect/oauth-store'
import { reply } from '../server/visit-report-pdf/http'

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'GET') return reply(response, 405, { error: 'method_not_allowed' })
  const env = oauthEnvironment()
  if (!env) return reply(response, 503, { error: 'not_configured' })
  const url = new URL(request.url ?? '/', env.origin)
  const state = url.searchParams.get('state') ?? ''
  const code = url.searchParams.get('code') ?? ''
  const matches = hasMatchingState(request, state)
  if (!matches || url.searchParams.getAll('state').length !== 1)
    return redirectToSettings(response, env.origin, 'error')
  clearStateCookie(response)
  if (url.searchParams.getAll('code').length !== 1)
    return redirectToSettings(response, env.origin, 'error')
  try {
    await completeStripeAuthorization(
      state,
      code,
      env.config,
      createStripeOAuthStore(env.admin),
      (actor) => canManageStripe(env.admin, actor),
    )
    return redirectToSettings(response, env.origin, 'connected')
  } catch {
    return redirectToSettings(response, env.origin, 'error')
  }
}
