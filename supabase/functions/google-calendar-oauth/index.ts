import { Buffer } from 'node:buffer'

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { GoogleCalendarClient } from '../_shared/google-calendar/calendar.ts'
import {
  beginCalendarAuthorization,
  completeCalendarAuthorization,
  refreshCalendarAccess,
  type CalendarActor,
  type OAuthConfig,
} from '../_shared/google-calendar/oauth.ts'
import {
  authorizeCalendarActor,
  createCalendarOAuthStore,
} from '../_shared/google-calendar/store.ts'
import { googleOAuthCredentials } from '../_shared/google-oauth-credentials.ts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const appUrl = Deno.env.get('APP_URL')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const encryptionKey = decodeEncryptionKey(Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') ?? '')
const redirectUri = supabaseUrl ? `${supabaseUrl}/functions/v1/google-calendar-oauth` : ''
const appOrigin = safeOrigin(appUrl)
const integrationEnabled =
  Deno.env.get('GOOGLE_CALENDAR_ENABLED') === 'true' &&
  Deno.env.get('GOOGLE_CALENDAR_WORKER_ENABLED') === 'true'
const corsHeaders = {
  'Access-Control-Allow-Origin': appOrigin ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
}

function safeOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

function decodeEncryptionKey(value: string): Buffer {
  try {
    const decoded = Buffer.from(value, 'base64url')
    return decoded.length === 32 ? decoded : Buffer.alloc(0)
  } catch {
    return Buffer.alloc(0)
  }
}

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: corsHeaders })
}

function config(): OAuthConfig {
  const { clientId, clientSecret } = googleOAuthCredentials((name) => Deno.env.get(name))
  if (!redirectUri || encryptionKey.length !== 32) throw new Error('OAuth not configured')
  return { clientId, clientSecret, redirectUri, encryptionKey }
}

function adminClient(): SupabaseClient {
  if (!supabaseUrl || !serviceKey) throw new Error('Calendar service unavailable')
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
}

function callbackRedirect(result: 'error', params?: { state: string; code: string }) {
  if (!appOrigin) return new Response(null, { status: 503 })
  const url = new URL('/ajustes', `${appOrigin}/`)
  url.searchParams.set('tab', 'integraciones')
  if (params) {
    url.hash = new URLSearchParams({
      calendar_state: params.state,
      calendar_code: params.code,
    }).toString()
  } else {
    url.searchParams.set('calendar', result)
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

function handleCallback(request: Request) {
  const url = new URL(request.url)
  const state = url.searchParams.get('state') ?? ''
  const code = url.searchParams.get('code') ?? ''
  if (!appOrigin) return new Response(null, { status: 503 })
  if (
    url.searchParams.has('error') ||
    !/^[A-Za-z0-9_-]{43}$/.test(state) ||
    !code ||
    code.length > 4096
  )
    return callbackRedirect('error')
  return callbackRedirect('error', { state, code })
}

async function completeConnection(
  admin: SupabaseClient,
  expectedActor: CalendarActor,
  state: string,
  code: string,
) {
  const store = createCalendarOAuthStore(admin, appOrigin ?? '')
  const actor = await completeCalendarAuthorization(
    state,
    code,
    expectedActor,
    config(),
    store,
    (pendingActor) => authorizeCalendarActor(admin, pendingActor),
  )
  const { data: connection, error } = await admin
    .from('google_calendar_connections')
    .select('refresh_token_ciphertext,calendar_id')
    .eq('tenant_id', actor.tenantId)
    .eq('user_id', actor.userId)
    .eq('status', 'provisioning')
    .maybeSingle()
  if (error || !connection?.refresh_token_ciphertext) throw new Error('Calendar setup failed')
  const { accessToken } = await refreshCalendarAccess(
    actor,
    connection.refresh_token_ciphertext,
    config(),
    store,
  )
  const calendar = new GoogleCalendarClient(accessToken)
  // Reuse an existing secondary calendar after reauthorization; never create one on every login.
  const calendarId = connection.calendar_id ?? (await calendar.createSecondaryCalendar())
  if (!connection.calendar_id) {
    const { data: saved, error: saveError } = await admin.rpc('save_google_calendar_calendar_id', {
      p_tenant_id: actor.tenantId,
      p_user_id: actor.userId,
      p_calendar_id: calendarId,
    })
    if (saveError || saved !== true) throw new Error('Calendar ID was not persisted')
  }
  const { data: completed, error: completeError } = await admin.rpc(
    'complete_google_calendar_connection',
    { p_tenant_id: actor.tenantId, p_user_id: actor.userId, p_calendar_id: calendarId },
  )
  if (completeError || completed !== true) throw new Error('Calendar setup was not confirmed')
}

async function handleAction(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  if (!appOrigin || origin !== appOrigin) return json(403, { error: 'origin_not_allowed' })
  const authorization = request.headers.get('authorization') ?? ''
  const token = /^Bearer ([^\s]{1,8192})$/.exec(authorization)?.[1]
  if (!token) return json(401, { error: 'unauthorized' })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'invalid_request' })
  }
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  if (
    typeof input.tenantId !== 'string' ||
    !uuidPattern.test(input.tenantId) ||
    !['start', 'complete', 'status', 'disconnect'].includes(String(input.action))
  )
    return json(400, { error: 'invalid_request' })
  if (
    input.action === 'complete' &&
    (typeof input.state !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.state) ||
      typeof input.code !== 'string' ||
      !input.code ||
      input.code.length > 4096)
  )
    return json(400, { error: 'invalid_request' })
  try {
    const admin = adminClient()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const userId = userData.user?.id
    if (userError || !userId) return json(401, { error: 'unauthorized' })
    const actor = { tenantId: input.tenantId, userId }
    const { data: member, error: memberError } = await admin.rpc('is_google_calendar_member', {
      p_tenant_id: actor.tenantId,
      p_user_id: actor.userId,
    })
    if (memberError) return json(503, { error: 'calendar_unavailable' })
    if (member !== true) return json(403, { error: 'not_allowed' })
    const { data: accessActive, error: accessError } = await admin.rpc(
      'authorize_google_calendar_actor',
      { p_tenant_id: actor.tenantId, p_user_id: actor.userId },
    )
    if (accessError || typeof accessActive !== 'boolean')
      return json(503, { error: 'calendar_unavailable' })
    if ((input.action === 'start' || input.action === 'complete') && !accessActive)
      return json(403, { error: 'access_inactive' })

    if ((input.action === 'start' || input.action === 'complete') && !integrationEnabled)
      return json(503, { error: 'integration_not_ready' })
    if (input.action === 'start') {
      const url = await beginCalendarAuthorization(
        actor,
        config(),
        createCalendarOAuthStore(admin, appOrigin),
        (pendingActor) => authorizeCalendarActor(admin, pendingActor),
      )
      return json(200, { authorizationUrl: url })
    }
    if (input.action === 'complete') {
      await completeConnection(admin, actor, input.state as string, input.code as string)
      return json(200, { connected: true })
    }
    if (input.action === 'disconnect') {
      const { error } = await admin.rpc('disconnect_google_calendar_connection', {
        p_tenant_id: actor.tenantId,
        p_user_id: actor.userId,
      })
      if (error) return json(503, { error: 'disconnect_failed' })
      return json(200, { disconnected: true })
    }
    const { data, error } = await admin
      .from('google_calendar_connections')
      .select('status,last_synced_at,last_error')
      .eq('tenant_id', actor.tenantId)
      .eq('user_id', actor.userId)
      .maybeSingle()
    if (error) return json(503, { error: 'status_unavailable' })
    const { count, error: jobsError } = await admin
      .from('google_calendar_sync_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', actor.tenantId)
      .eq('user_id', actor.userId)
    if (jobsError) return json(503, { error: 'status_unavailable' })
    return json(200, {
      status: data?.status ?? 'disconnected',
      lastSyncedAt: data?.last_synced_at ?? null,
      lastError: data?.last_error ?? null,
      pendingJobs: count ?? 0,
      accessActive,
    })
  } catch {
    return json(503, { error: 'calendar_unavailable' })
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (request.method === 'GET') return handleCallback(request)
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  return handleAction(request)
})
