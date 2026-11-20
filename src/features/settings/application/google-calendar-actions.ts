import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type GoogleCalendarStatus = {
  status: 'connected' | 'disconnected' | 'provisioning' | 'reauthorize'
  lastSyncedAt: string | null
  lastError: 'google_unavailable' | 'calendar_conflict' | 'invalid_visit' | 'reauthorize' | null
  pendingJobs: number
}

type FunctionPayload = Record<string, unknown>

async function invokeCalendar<T extends FunctionPayload>(action: string, tenantId: string) {
  const { data, error } = await createBrowserSupabaseClient().functions.invoke<FunctionPayload>(
    'google-calendar-oauth',
    { body: { action, tenantId } },
  )
  if (error || !data || typeof data !== 'object')
    throw new Error('Google Calendar no está disponible.')
  return data as T
}

function isCalendarStatus(value: unknown): value is GoogleCalendarStatus {
  if (!value || typeof value !== 'object') return false
  const status = value as Partial<GoogleCalendarStatus>
  return (
    ['connected', 'disconnected', 'provisioning', 'reauthorize'].includes(String(status.status)) &&
    (status.lastSyncedAt === null || typeof status.lastSyncedAt === 'string') &&
    (status.lastError === null ||
      ['google_unavailable', 'calendar_conflict', 'invalid_visit', 'reauthorize'].includes(
        String(status.lastError),
      )) &&
    typeof status.pendingJobs === 'number' &&
    Number.isSafeInteger(status.pendingJobs) &&
    status.pendingJobs >= 0
  )
}

export async function getGoogleCalendarStatus(tenantId: string): Promise<GoogleCalendarStatus> {
  const payload = await invokeCalendar<FunctionPayload>('status', tenantId)
  if (!isCalendarStatus(payload)) throw new Error('No se pudo leer el estado de Google Calendar.')
  return payload
}

export async function beginGoogleCalendarConnection(tenantId: string): Promise<string> {
  const payload = await invokeCalendar<FunctionPayload>('start', tenantId)
  if (typeof payload.authorizationUrl !== 'string')
    throw new Error('No se pudo iniciar la conexión con Google.')
  const url = new URL(payload.authorizationUrl)
  if (url.protocol !== 'https:' || url.origin !== 'https://accounts.google.com')
    throw new Error('Google devolvió una dirección de conexión no válida.')
  return url.toString()
}

export async function disconnectGoogleCalendar(tenantId: string): Promise<void> {
  const payload = await invokeCalendar<FunctionPayload>('disconnect', tenantId)
  if (payload.disconnected !== true) throw new Error('No se pudo desconectar Google Calendar.')
}

export async function queueGoogleCalendarSync(tenantId: string): Promise<number> {
  const { data, error } = await createBrowserSupabaseClient().rpc('queue_my_google_calendar_sync', {
    p_tenant_id: tenantId,
  })
  if (error || typeof data !== 'number') throw new Error('No se pudo solicitar la sincronización.')
  return data
}

export function googleCalendarStatusQuery(tenantId: string) {
  return queryOptions({
    queryKey: ['settings', 'google-calendar', tenantId],
    queryFn: () => getGoogleCalendarStatus(tenantId),
    enabled: Boolean(tenantId),
    refetchInterval: (query) => (query.state.data?.pendingJobs ? 5_000 : false),
  })
}
