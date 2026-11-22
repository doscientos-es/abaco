import { createHash, randomBytes } from 'node:crypto'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const statePattern = /^[A-Za-z0-9_-]{43}$/
const accountIdPattern = /^acct_[a-zA-Z0-9]+$/
const stateLifetimeMs = 10 * 60 * 1000

export type StripeActor = { tenantId: string; userId: string }
export type StripeOAuthConfig = {
  clientId: string
  secretKey: string
  redirectUri: string
  liveMode: boolean
}

/** Persistence must be server-only. Consumption must atomically delete the state. */
export interface StripeOAuthStore {
  saveState(hash: string, actor: StripeActor, expiresAt: number): Promise<void>
  consumeState(hash: string): Promise<{ actor: StripeActor; expiresAt: number } | null>
  /** Atomically recheck owner/admin membership, and reject accounts already linked elsewhere. */
  saveConnection(actor: StripeActor, accountId: string, liveMode: boolean): Promise<void>
}

function validateConfig(config: StripeOAuthConfig) {
  let redirect: URL
  try {
    redirect = new URL(config.redirectUri)
  } catch {
    throw new Error('Stripe OAuth not configured')
  }
  if (
    !/^ca_[a-zA-Z0-9]+$/.test(config.clientId) ||
    !config.secretKey ||
    redirect.protocol !== 'https:' ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash
  )
    throw new Error('Stripe OAuth not configured')
}

function validateActor(actor: StripeActor) {
  if (!uuid.test(actor.tenantId) || !uuid.test(actor.userId)) throw new Error('Invalid actor')
}

function hashState(state: string) {
  return createHash('sha256').update(state).digest('base64url')
}

export async function beginStripeAuthorization(
  actor: StripeActor,
  config: StripeOAuthConfig,
  store: StripeOAuthStore,
  authorize: (actor: StripeActor) => Promise<boolean>,
  now = Date.now(),
): Promise<string> {
  validateConfig(config)
  validateActor(actor)
  if (!(await authorize(actor))) throw new Error('Not authorized')
  const state = randomBytes(32).toString('base64url')
  await store.saveState(hashState(state), actor, now + stateLifetimeMs)
  const url = new URL('https://connect.stripe.com/oauth/authorize')
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    scope: 'read_write',
    redirect_uri: config.redirectUri,
    state,
  }).toString()
  return url.toString()
}

export async function completeStripeAuthorization(
  state: string,
  code: string,
  config: StripeOAuthConfig,
  store: StripeOAuthStore,
  authorize: (actor: StripeActor) => Promise<boolean>,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<StripeActor> {
  validateConfig(config)
  if (!statePattern.test(state) || !/^ac_[a-zA-Z0-9]{1,500}$/.test(code))
    throw new Error('Invalid Stripe OAuth callback')
  const pending = await store.consumeState(hashState(state))
  if (!pending || pending.expiresAt <= now) throw new Error('Invalid or expired OAuth state')
  validateActor(pending.actor)
  if (!(await authorize(pending.actor))) throw new Error('Not authorized')

  // Stripe revokes the connection if the same code is exchanged twice; never retry this call.
  const response = await fetcher('https://connect.stripe.com/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code }),
  })
  if (!response.ok) throw new Error('Stripe authorization failed')
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Invalid Stripe authorization response')
  const result = payload as Record<string, unknown>
  if (
    typeof result.stripe_user_id !== 'string' ||
    !accountIdPattern.test(result.stripe_user_id) ||
    result.scope !== 'read_write' ||
    result.livemode !== config.liveMode
  )
    throw new Error('Invalid Stripe authorization response')
  // Stripe-Account with the platform key is sufficient; never persist returned access tokens.
  await store.saveConnection(pending.actor, result.stripe_user_id, config.liveMode)
  return pending.actor
}
