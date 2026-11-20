import { createClient } from 'npm:@supabase/supabase-js@2'

import { CalendarRequestError, GoogleCalendarClient } from '../_shared/google-calendar/calendar.ts'
import { projectVisitEvent } from '../_shared/google-calendar/event.ts'
import {
  CalendarAuthorizationError,
  refreshCalendarAccess,
} from '../_shared/google-calendar/oauth.ts'
import { createCalendarOAuthStore } from '../_shared/google-calendar/store.ts'

type Job = {
  job_id: string
  tenant_id: string
  user_id: string
  visit_id: string
  lease_token: string
  generation: number
}
type Visit = {
  id: string
  tenant_id: string
  assigned_user_id: string | null
  work_team_id: string | null
  status: string
  scheduled_start_at: string
  scheduled_end_at: string
  location_id: string | null
}
type Mapping = { calendar_id: string; event_id: string; ownership_marker: string }

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const config = () => {
  const clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')
  const key = decodeKey(Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') ?? '')
  const redirectUri = supabaseUrl ? `${supabaseUrl}/functions/v1/google-calendar-oauth` : ''
  if (!clientId || !clientSecret || !redirectUri || key.length !== 32)
    throw new Error('Calendar worker not configured')
  return { clientId, clientSecret, redirectUri, encryptionKey: key }
}

function decodeKey(value: string) {
  try {
    const key = Buffer.from(value, 'base64url')
    return key.length === 32 ? key : Buffer.alloc(0)
  } catch {
    return Buffer.alloc(0)
  }
}

function adminClient() {
  if (!supabaseUrl || !serviceKey) throw new Error('Calendar worker not configured')
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
}

function readHeaderSecret(request: Request) {
  return request.headers.get('x-cron-secret')
}

async function authorizeWorker(admin: ReturnType<typeof adminClient>, secret: string) {
  const { data, error } = await admin.rpc('authorize_google_calendar_sync_worker', {
    p_secret: secret,
  })
  return !error && data === true
}

async function claimJob(admin: ReturnType<typeof adminClient>): Promise<Job | null> {
  const { data, error } = await admin.rpc('claim_google_calendar_sync_job')
  if (error) throw new Error('Could not claim calendar job')
  return Array.isArray(data) ? ((data[0] as Job | undefined) ?? null) : null
}

async function loadMapping(admin: ReturnType<typeof adminClient>, job: Job) {
  const { data, error } = await admin
    .from('google_calendar_sync_events')
    .select('calendar_id,event_id,ownership_marker')
    .eq('tenant_id', job.tenant_id)
    .eq('user_id', job.user_id)
    .eq('visit_id', job.visit_id)
    .maybeSingle()
  if (error) throw new Error('Could not load calendar event mapping')
  return data as Mapping | null
}

async function isAssigned(admin: ReturnType<typeof adminClient>, job: Job, visit: Visit) {
  const { data: membership, error } = await admin
    .from('memberships')
    .select('role')
    .eq('tenant_id', job.tenant_id)
    .eq('user_id', job.user_id)
    .maybeSingle()
  if (error) throw new Error('Could not verify visit assignment')
  if (membership?.role !== 'user' && membership?.role !== 'technician') return false
  if (visit.assigned_user_id) return visit.assigned_user_id === job.user_id
  if (!visit.work_team_id) return false
  const { data, error: teamError } = await admin
    .from('work_team_members')
    .select('user_id')
    .eq('tenant_id', job.tenant_id)
    .eq('team_id', visit.work_team_id)
    .eq('user_id', job.user_id)
    .maybeSingle()
  if (teamError) throw new Error('Could not verify team assignment')
  return Boolean(data)
}

async function loadVisit(admin: ReturnType<typeof adminClient>, job: Job) {
  const { data, error } = await admin
    .from('service_visits')
    .select(
      'id,tenant_id,assigned_user_id,work_team_id,status,scheduled_start_at,scheduled_end_at,location_id',
    )
    .eq('tenant_id', job.tenant_id)
    .eq('id', job.visit_id)
    .maybeSingle()
  if (error) throw new Error('Could not load visit')
  return data as Visit | null
}

async function eventInput(admin: ReturnType<typeof adminClient>, job: Job, visit: Visit) {
  const { data, error } = visit.location_id
    ? await admin
        .from('service_locations')
        .select('timezone')
        .eq('tenant_id', job.tenant_id)
        .eq('id', visit.location_id)
        .maybeSingle()
    : { data: null, error: null }
  if (error) throw new Error('Could not load visit timezone')
  return {
    tenantId: job.tenant_id,
    userId: job.user_id,
    visitId: job.visit_id,
    start: new Date(visit.scheduled_start_at),
    end: new Date(visit.scheduled_end_at),
    timeZone: data?.timezone || 'Europe/Madrid',
  }
}

async function saveMapping(
  admin: ReturnType<typeof adminClient>,
  job: Job,
  calendarId: string,
  eventId: string,
  marker: string,
) {
  const { error } = await admin.from('google_calendar_sync_events').insert({
    tenant_id: job.tenant_id,
    user_id: job.user_id,
    visit_id: job.visit_id,
    calendar_id: calendarId,
    event_id: eventId,
    ownership_marker: marker,
  })
  if (!error) return
  // Another generation may have prepared the mapping already; never replace its marker.
  const current = await loadMapping(admin, job)
  if (!current || current.calendar_id !== calendarId || current.event_id !== eventId)
    throw new Error('Calendar event mapping conflict')
}

async function deleteMapping(admin: ReturnType<typeof adminClient>, job: Job) {
  const { error } = await admin
    .from('google_calendar_sync_events')
    .delete()
    .eq('tenant_id', job.tenant_id)
    .eq('user_id', job.user_id)
    .eq('visit_id', job.visit_id)
  if (error) throw new Error('Could not remove calendar event mapping')
}

async function processJob(admin: ReturnType<typeof adminClient>, job: Job) {
  const { data: connection, error } = await admin
    .from('google_calendar_connections')
    .select('status,calendar_id,refresh_token_ciphertext,sync_lease_token')
    .eq('tenant_id', job.tenant_id)
    .eq('user_id', job.user_id)
    .maybeSingle()
  if (
    error ||
    !connection ||
    connection.status !== 'connected' ||
    !connection.calendar_id ||
    !connection.refresh_token_ciphertext
  )
    throw new Error('Calendar connection is no longer active')
  if (connection.sync_lease_token !== job.lease_token) throw new Error('Calendar lease expired')

  const actor = { tenantId: job.tenant_id, userId: job.user_id }
  const store = createCalendarOAuthStore(admin, '')
  const { accessToken } = await refreshCalendarAccess(
    actor,
    connection.refresh_token_ciphertext,
    config(),
    store,
  )
  const calendar = new GoogleCalendarClient(accessToken)
  const mapping = await loadMapping(admin, job)
  const visit = await loadVisit(admin, job)
  const active = Boolean(
    visit &&
    ['scheduled', 'in_progress'].includes(visit.status) &&
    (await isAssigned(admin, job, visit)),
  )

  if (!active) {
    if (mapping) {
      try {
        await calendar.deleteVisit(mapping.calendar_id, mapping.event_id, mapping.ownership_marker)
      } catch (error) {
        if (!(error instanceof CalendarRequestError && [404, 410].includes(error.status)))
          throw error
      }
      await deleteMapping(admin, job)
    }
    return
  }

  if (!visit) throw new Error('Invalid visit identity')
  const input = await eventInput(admin, job, visit)
  const projected = projectVisitEvent(input)
  let current = mapping
  if (!current) {
    const marker = crypto.randomUUID().replaceAll('-', '').repeat(2)
    await saveMapping(admin, job, connection.calendar_id, projected.id, marker)
    current = await loadMapping(admin, job)
    if (!current) throw new Error('Calendar mapping was not persisted')
  }
  if (current.calendar_id !== connection.calendar_id || current.event_id !== projected.id)
    throw new Error('Calendar event mapping conflict')

  try {
    await calendar.updateVisit(current.calendar_id, input, current.ownership_marker)
  } catch (error) {
    if (error instanceof CalendarRequestError && error.status === 404) {
      await calendar.insertVisit(current.calendar_id, input, current.ownership_marker)
    } else {
      throw error
    }
  }
}

function errorCode(error: unknown): string {
  if (error instanceof CalendarAuthorizationError && error.reason === 'revoked')
    return 'reauthorize'
  if (error instanceof CalendarRequestError) {
    if (error.status === 401) return 'reauthorize'
    if ([409, 412].includes(error.status)) return 'calendar_conflict'
  }
  if (error instanceof Error && /identity|time range|time zone/.test(error.message))
    return 'invalid_visit'
  if (error instanceof Error && /ownership|projection|mapping conflict/.test(error.message))
    return 'calendar_conflict'
  return 'google_unavailable'
}

async function finishJob(admin: ReturnType<typeof adminClient>, job: Job, code: string | null) {
  const { error } = await admin.rpc('finish_google_calendar_sync_job', {
    p_job_id: job.job_id,
    p_lease_token: job.lease_token,
    p_generation: job.generation,
    p_error_code: code,
    p_retry_seconds: Math.min(86_400, 60 * 2 ** Math.min(10, job.generation)),
  })
  if (error) throw new Error('Could not finish calendar job')
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const secret = readHeaderSecret(request)
  if (!secret || secret.length > 256) return new Response(null, { status: 401 })
  let admin: ReturnType<typeof adminClient>
  try {
    admin = adminClient()
    if (!(await authorizeWorker(admin, secret))) return new Response(null, { status: 401 })
  } catch {
    return new Response(null, { status: 503 })
  }

  let processed = 0
  const started = performance.now()
  while (processed < 12 && performance.now() - started < 40_000) {
    let job: Job | null
    try {
      job = await claimJob(admin)
    } catch {
      return Response.json({ processed, error: 'claim_failed' }, { status: 503 })
    }
    if (!job) break
    let failure: string | null = null
    try {
      await processJob(admin, job)
    } catch (error) {
      failure = errorCode(error)
    }
    try {
      await finishJob(admin, job, failure)
    } catch {
      return Response.json({ processed, error: 'finish_failed' }, { status: 503 })
    }
    processed++
  }
  return Response.json({ processed })
})
