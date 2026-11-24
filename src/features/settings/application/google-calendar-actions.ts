import { FunctionsHttpError } from '@supabase/supabase-js'
import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type GoogleCalendarStatus = {
  status: 'connected' | 'disconnected' | 'provisioning' | 'reauthorize'
  lastSyncedAt: string | null
  lastError: 'google_unavailable' | 'calendar_conflict' | 'invalid_visit' | 'reauthorize' | null
  pendingJobs: number
}

type FunctionPayload = Record<string, unknown>
const calendarStateKey = 'abaco-google-calendar-state'
const statePattern = /^[A-Za-z0-9_-]{43}$/

export class GoogleCalendarPermissionError extends Error {
  constructor() {
    super('Tu cuenta no tiene permiso para usar Google Calendar en esta empresa.')
  }
}

async function invokeCalendar<T extends FunctionPayload>(
  action: string,
  tenantId: string,
  extra: FunctionPayload = {},
) {
  const { data, error } = await createBrowserSupabaseClient().functions.invoke<FunctionPayload>(
    'google-calendar-oauth',
    { body: { ...extra, action, tenantId } },
  )
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    const response = error.context
    if (response.status === 403) {
      const body: unknown = await response.json().catch(() => null)
      if (body && typeof body === 'object' && 'error' in body && body.error === 'not_allowed')
        throw new GoogleCalendarPermissionError()
    }
  }
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
  const state = url.searchParams.get('state') ?? ''
  if (!statePattern.test(state)) throw new Error('Google devolvió un estado de conexión no válido.')
  sessionStorage.setItem(calendarStateKey, state)
  return url.toString()
}

export async function completeGoogleCalendarConnection(tenantId: string): Promise<boolean> {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  if (!fragment.has('calendar_state') && !fragment.has('calendar_code')) return false

  // Remove the authorization code from the address bar before any asynchronous work.
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  )
  const expected = sessionStorage.getItem(calendarStateKey)
  sessionStorage.removeItem(calendarStateKey)
  const states = fragment.getAll('calendar_state')
  const codes = fragment.getAll('calendar_code')
  const state = states[0] ?? ''
  const code = codes[0] ?? ''
  if (
    states.length !== 1 ||
    codes.length !== 1 ||
    !statePattern.test(state) ||
    state !== expected ||
    !code ||
    code.length > 4096
  )
    throw new Error('La conexión de Google no corresponde a esta sesión.')

  const payload = await invokeCalendar<FunctionPayload>('complete', tenantId, { state, code })
  if (payload.connected !== true) throw new Error('No se pudo completar la conexión con Google.')
  return true
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
