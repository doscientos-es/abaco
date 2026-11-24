import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export const calendarScope = 'https://www.googleapis.com/auth/calendar.app.created'
export type CalendarActor = { tenantId: string; userId: string }
type PendingAuthorization = { actor: CalendarActor; verifier: string; expiresAt: number }
export interface OAuthStore {
  saveState(hash: string, pending: PendingAuthorization): Promise<void>
  consumeState(hash: string): Promise<PendingAuthorization | null>
  saveAuthorizedConnection(actor: CalendarActor, encryptedRefreshToken: string): Promise<void>
  rotateRefreshToken(actor: CalendarActor, previous: string, next: string): Promise<void>
}
export type OAuthConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  encryptionKey: Buffer
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const statePattern = /^[A-Za-z0-9_-]{43}$/
const digest = (value: string) => createHash('sha256').update(value).digest('base64url')

function validateActor(actor: CalendarActor) {
  if (!uuid.test(actor.tenantId) || !uuid.test(actor.userId)) throw new Error('Invalid actor')
}

function validateConfig(config: OAuthConfig) {
  let redirect: URL
  try {
    redirect = new URL(config.redirectUri)
  } catch {
    throw new Error('OAuth not configured')
  }
  if (
    !config.clientId ||
    !config.clientSecret ||
    config.encryptionKey.length !== 32 ||
    redirect.protocol !== 'https:' ||
    redirect.username ||
    redirect.password ||
    redirect.hash ||
    redirect.search
  )
    throw new Error('OAuth not configured')
}

function associatedData(actor: CalendarActor) {
  validateActor(actor)
  return Buffer.from(
    `abaco-calendar-v1:${actor.tenantId.toLowerCase()}:${actor.userId.toLowerCase()}`,
  )
}

export function encryptRefreshToken(token: string, key: Buffer, actor: CalendarActor) {
  if (!token || key.length !== 32) throw new Error('Invalid token encryption input')
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(associatedData(actor))
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return [
    'v1',
    nonce.toString('base64url'),
    encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.')
}

export function decryptRefreshToken(value: string, key: Buffer, actor: CalendarActor) {
  try {
    const parts = value.split('.')
    if (parts.length !== 4 || parts[0] !== 'v1' || key.length !== 32) throw new Error()
    const nonce = Buffer.from(parts[1] ?? '', 'base64url')
    const encrypted = Buffer.from(parts[2] ?? '', 'base64url')
    const tag = Buffer.from(parts[3] ?? '', 'base64url')
    if (nonce.length !== 12 || tag.length !== 16 || !encrypted.length) throw new Error()
    const cipher = createDecipheriv('aes-256-gcm', key, nonce)
    cipher.setAAD(associatedData(actor))
    cipher.setAuthTag(tag)
    return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8')
  } catch {
    throw new Error('Cannot decrypt calendar credential')
  }
}

export async function beginCalendarAuthorization(
  actor: CalendarActor,
  config: OAuthConfig,
  store: OAuthStore,
  authorize: (actor: CalendarActor) => Promise<boolean>,
  now = Date.now(),
) {
  validateActor(actor)
  validateConfig(config)
  if (!(await authorize(actor))) throw new Error('Not authorized')
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  await store.saveState(digest(state), { actor: { ...actor }, verifier, expiresAt: now + 600_000 })
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: calendarScope,
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: digest(verifier),
    code_challenge_method: 'S256',
  }).toString()
  return url.toString()
}

export async function completeCalendarAuthorization(
  state: string,
  code: string,
  expectedActor: CalendarActor,
  config: OAuthConfig,
  store: OAuthStore,
  authorize: (actor: CalendarActor) => Promise<boolean>,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  validateConfig(config)
  validateActor(expectedActor)
  if (!statePattern.test(state)) throw new Error('Invalid authorization state')
  const pending = await store.consumeState(digest(state))
  if (pending) validateActor(pending.actor)
  if (
    !pending ||
    pending.actor.tenantId !== expectedActor.tenantId ||
    pending.actor.userId !== expectedActor.userId ||
    !Number.isFinite(pending.expiresAt) ||
    pending.expiresAt <= now ||
    !statePattern.test(pending.verifier) ||
    !code ||
    code.length > 4096 ||
    !(await authorize(pending.actor))
  )
    throw new Error('Invalid authorization state')
  let response: Response
  try {
    response = await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: pending.verifier,
      }),
    })
  } catch {
    throw new Error('Google authorization unavailable')
  }
  if (!response.ok) throw new Error('Google authorization failed')
  const data: unknown = await response.json().catch(() => null)
  const result = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  if (
    typeof result.refresh_token !== 'string' ||
    !result.refresh_token ||
    typeof result.scope !== 'string' ||
    !result.scope.split(/\s+/).includes(calendarScope)
  )
    throw new Error('Google authorization missing permission or offline access')
  await store.saveAuthorizedConnection(
    pending.actor,
    encryptRefreshToken(result.refresh_token, config.encryptionKey, pending.actor),
  )
  return pending.actor
}

export class CalendarAuthorizationError extends Error {
  constructor(readonly reason: 'revoked' | 'unavailable') {
    super('Google Calendar authorization unavailable')
  }
}

export async function refreshCalendarAccess(
  actor: CalendarActor,
  encryptedRefreshToken: string,
  config: OAuthConfig,
  store: OAuthStore,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  validateConfig(config)
  const refreshToken = decryptRefreshToken(encryptedRefreshToken, config.encryptionKey, actor)
  let response: Response
  try {
    response = await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
  } catch {
    throw new CalendarAuthorizationError('unavailable')
  }
  const data: unknown = await response.json().catch(() => null)
  const result = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  if (!response.ok)
    throw new CalendarAuthorizationError(
      result.error === 'invalid_grant' ? 'revoked' : 'unavailable',
    )
  if (
    typeof result.access_token !== 'string' ||
    !result.access_token ||
    (result.token_type !== 'Bearer' && result.token_type !== 'bearer') ||
    typeof result.expires_in !== 'number' ||
    !Number.isFinite(result.expires_in) ||
    result.expires_in <= 0 ||
    (result.scope !== undefined &&
      (typeof result.scope !== 'string' || !result.scope.split(/\s+/).includes(calendarScope)))
  )
    throw new CalendarAuthorizationError('unavailable')
  if (result.refresh_token !== undefined) {
    if (typeof result.refresh_token !== 'string' || !result.refresh_token)
      throw new CalendarAuthorizationError('unavailable')
    await store.rotateRefreshToken(
      actor,
      encryptedRefreshToken,
      encryptRefreshToken(result.refresh_token, config.encryptionKey, actor),
    )
  }
  return { accessToken: result.access_token, expiresAt: now + result.expires_in * 1000 }
}

/** Revocation can affect other grants for the same Google account and client. */
export async function revokeCalendarAccess(
  actor: CalendarActor,
  encryptedRefreshToken: string,
  config: OAuthConfig,
  fetcher: typeof fetch = fetch,
) {
  validateConfig(config)
  const refreshToken = decryptRefreshToken(encryptedRefreshToken, config.encryptionKey, actor)
  let response: Response
  try {
    response = await fetcher('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
    })
  } catch {
    throw new CalendarAuthorizationError('unavailable')
  }
  if (!response.ok) throw new CalendarAuthorizationError('unavailable')
}
