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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const appUrl = Deno.env.get('APP_URL')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')
const clientSecret = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')
const encryptionKey = decodeEncryptionKey(Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') ?? '')
const redirectUri = supabaseUrl ? `${supabaseUrl}/functions/v1/google-calendar-oauth` : ''
const appOrigin = safeOrigin(appUrl)
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

function json(status: number, body: Record<string, unknown>, origin = '') {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, 'Access-Control-Allow-Origin': origin },
  })
}

function config(): OAuthConfig {
  if (!clientId || !clientSecret || !redirectUri || encryptionKey.length !== 32)
    throw new Error('OAuth not configured')
  return { clientId, clientSecret, redirectUri, encryptionKey }
}

function adminClient(): SupabaseClient {
  if (!supabaseUrl || !serviceKey) throw new Error('Calendar service unavailable')
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
}

function callbackRedirect(result: 'connected' | 'error') {
  const url = new URL('/ajustes', `${appOrigin}/`)
  url.searchParams.set('tab', 'integraciones')
  url.searchParams.set('calendar', result)
  return Response.redirect(url, 303)
}

async function handleCallback(request: Request) {
  const url = new URL(request.url)
  const state = url.searchParams.get('state') ?? ''
  const code = url.searchParams.get('code') ?? ''
  if (url.searchParams.has('error') || !state || !code || !appOrigin)
    return callbackRedirect('error')
  try {
    const admin = adminClient()
    const store = createCalendarOAuthStore(admin, appOrigin ?? '')
    const actor = await completeCalendarAuthorization(
      state,
      code,
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
    const { data: completed, error: completeError } = await admin.rpc(
      'complete_google_calendar_connection',
      { p_tenant_id: actor.tenantId, p_user_id: actor.userId, p_calendar_id: calendarId },
    )
    if (completeError || completed !== true) throw new Error('Calendar setup was not confirmed')
    return callbackRedirect('connected')
  } catch {
    return callbackRedirect('error')
  }
}

async function handleAction(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  if (!appOrigin || origin !== appOrigin) return json(403, { error: 'origin_not_allowed' }, origin)
  const authorization = request.headers.get('authorization') ?? ''
  const token = /^Bearer ([^\s]{1,8192})$/.exec(authorization)?.[1]
  if (!token) return json(401, { error: 'unauthorized' }, origin)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'invalid_request' }, origin)
  }
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  if (
    typeof input.tenantId !== 'string' ||
    !uuidPattern.test(input.tenantId) ||
    !['start', 'status', 'disconnect'].includes(String(input.action))
  )
    return json(400, { error: 'invalid_request' }, origin)
  try {
    const admin = adminClient()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const userId = userData.user?.id
    if (userError || !userId) return json(401, { error: 'unauthorized' }, origin)
    const actor = { tenantId: input.tenantId, userId }
    if (!(await authorizeCalendarActor(admin, actor)))
      return json(403, { error: 'not_allowed' }, origin)

    if (input.action === 'start') {
      const url = await beginCalendarAuthorization(
        actor,
        config(),
        createCalendarOAuthStore(admin, appOrigin ?? ''),
        (pendingActor) => authorizeCalendarActor(admin, pendingActor),
      )
      return json(200, { authorizationUrl: url }, origin)
    }
    if (input.action === 'disconnect') {
      const { error } = await admin.rpc('disconnect_google_calendar_connection', {
        p_tenant_id: actor.tenantId,
        p_user_id: actor.userId,
      })
      if (error) return json(503, { error: 'disconnect_failed' }, origin)
      return json(200, { disconnected: true }, origin)
    }
    const { data, error } = await admin
      .from('google_calendar_connections')
      .select('status,last_synced_at,last_error')
      .eq('tenant_id', actor.tenantId)
      .eq('user_id', actor.userId)
      .maybeSingle()
    if (error) return json(503, { error: 'status_unavailable' }, origin)
    return json(
      200,
      {
        status: data?.status ?? 'disconnected',
        lastSyncedAt: data?.last_synced_at ?? null,
        lastError: data?.last_error ?? null,
      },
      origin,
    )
  } catch {
    return json(503, { error: 'calendar_unavailable' }, origin)
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (request.method === 'GET') return handleCallback(request)
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  return handleAction(request)
})
