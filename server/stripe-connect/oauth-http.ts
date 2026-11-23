import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { createClient } from '@supabase/supabase-js'

import type { StripeOAuthConfig } from './oauth'

export const stateCookie = '__Host-stripe_connect_state'

export function oauthEnvironment(): {
  config: StripeOAuthConfig
  origin: string
  admin: ReturnType<typeof createClient>
} | null {
  const {
    STRIPE_CLIENT_ID,
    STRIPE_SECRET_KEY,
    STRIPE_CONNECT_MODE,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    APP_ORIGIN,
  } = process.env
  if (
    !STRIPE_CLIENT_ID ||
    !STRIPE_SECRET_KEY ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !APP_ORIGIN ||
    (STRIPE_CONNECT_MODE !== 'test' && STRIPE_CONNECT_MODE !== 'live')
  )
    return null
  try {
    const origin = new URL(APP_ORIGIN)
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== APP_ORIGIN ||
      origin.username ||
      origin.password
    )
      return null
    return {
      origin: APP_ORIGIN,
      config: {
        clientId: STRIPE_CLIENT_ID,
        secretKey: STRIPE_SECRET_KEY,
        redirectUri: `${APP_ORIGIN}/api/stripe_connect_callback`,
        liveMode: STRIPE_CONNECT_MODE === 'live',
      },
      admin: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    }
  } catch {
    return null
  }
}

export function setStateCookie(response: ServerResponse, state: string) {
  response.setHeader(
    'Set-Cookie',
    `${stateCookie}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  )
}

export function clearStateCookie(response: ServerResponse) {
  response.setHeader(
    'Set-Cookie',
    `${stateCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  )
}

export function hasMatchingState(request: IncomingMessage, state: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return false
  const cookies = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${stateCookie}=`))
  if (cookies.length !== 1) return false
  const value = cookies[0]?.slice(stateCookie.length + 1) ?? ''
  return (
    /^[A-Za-z0-9_-]{43}$/.test(value) && timingSafeEqual(Buffer.from(state), Buffer.from(value))
  )
}

export function redirectToSettings(
  response: ServerResponse,
  origin: string,
  result: 'connected' | 'error',
) {
  response.statusCode = 303
  response.setHeader('Location', `${origin}/ajustes?tab=integraciones&stripe=${result}`)
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.end()
}
