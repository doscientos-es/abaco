import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type AppointmentResponse = 'confirmed' | 'change'
export type AppointmentDecision = 'approved' | 'declined'
export type AppointmentExpiry = 24 | 72 | 168

export type PublicAppointment = {
  startAt: string
  endAt: string
  timezone: string
  response: AppointmentResponse | null
  proposedAt: string | null
  declined?: boolean
}

export type OfficeAppointmentLink = {
  id: string
  visit_id: string
  visit_revision: string
  original_start: string
  original_end: string
  timezone: string
  expires_at: string
  revoked_at: string | null
  response: AppointmentResponse | null
  proposed_start: string | null
  office_decision: AppointmentDecision | null
}

export type AppointmentChangeRequest = OfficeAppointmentLink & {
  service_visits: { title: string; updated_at: string; status: string } | null
}

const columns =
  'id,visit_id,visit_revision,original_start,original_end,timezone,expires_at,revoked_at,response,proposed_start,office_decision'

export const validAppointmentToken = (token: string) => /^[0-9a-f]{64}$/.test(token)

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createAppointmentLinkAttempt(hours: AppointmentExpiry) {
  return {
    hours,
    token: hex(crypto.getRandomValues(new Uint8Array(32))),
    operationId: crypto.randomUUID(),
  }
}

export function appointmentLinkUrl(origin: string, token: string) {
  if (!validAppointmentToken(token)) throw new Error('Enlace no válido.')
  const link = new URL('/cita', origin)
  link.hash = token
  return link.toString()
}

export async function issueAppointmentLink(
  tenantId: string,
  visitId: string,
  attempt: ReturnType<typeof createAppointmentLinkAttempt>,
) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(attempt.token))
  const { data, error } = await createBrowserSupabaseClient().rpc('create_visit_appointment_link', {
    p_tenant_id: tenantId,
    p_visit_id: visitId,
    p_digest: hex(new Uint8Array(digest)),
    p_hours: attempt.hours,
    p_operation_id: attempt.operationId,
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo confirmar el enlace.')
  return data
}

export async function listAppointmentLinks(tenantId: string, visitId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('visit_appointment_links')
    .select(columns)
    .eq('tenant_id', tenantId)
    .eq('visit_id', visitId)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(12)
  if (error) throw new Error('No se pudieron leer los enlaces de esta visita.')
  return (data ?? []) as OfficeAppointmentLink[]
}

export async function revokeAppointmentLink(tenantId: string, linkId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('revoke_visit_appointment_link', {
    p_tenant_id: tenantId,
    p_link_id: linkId,
  })
  if (error || data !== true) throw new Error(error?.message ?? 'No se confirmó la revocación.')
}

export async function listAppointmentChangeRequests(tenantId: string, page: number) {
  const start = page * 12
  const { data, error } = await createBrowserSupabaseClient()
    .from('visit_appointment_links')
    .select(`${columns},service_visits(title,updated_at,status)`)
    .eq('tenant_id', tenantId)
    .eq('response', 'change')
    .is('office_decision', null)
    .order('responded_at', { ascending: false })
    .order('id')
    .range(start, start + 12)
  if (error) throw new Error('No se pudieron comprobar las solicitudes de cita.')
  const rows = (data ?? []) as unknown as AppointmentChangeRequest[]
  return { rows: rows.slice(0, 12), hasNext: rows.length > 12 }
}

export async function decideAppointmentChange(
  tenantId: string,
  linkId: string,
  decision: AppointmentDecision,
  operationId: string,
) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'decide_visit_appointment_change',
    {
      p_tenant_id: tenantId,
      p_link_id: linkId,
      p_decision: decision,
      p_operation_id: operationId,
    },
  )
  if (error || data !== true) throw new Error(error?.message ?? 'No se pudo confirmar la decisión.')
}

let publicAppointments: SupabaseClient | undefined

function anonymousAppointmentClient() {
  if (publicAppointments) return publicAppointments
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = import.meta.env
  if (!url || !key) throw new Error('No se pudo comprobar el enlace.')
  publicAppointments = createClient(url, key, {
    auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
        }),
    },
  })
  return publicAppointments
}

export async function readAppointmentLink(
  token: string,
  signal: AbortSignal,
): Promise<PublicAppointment | null> {
  if (!validAppointmentToken(token)) return null
  const { data, error } = await anonymousAppointmentClient()
    .rpc('read_visit_appointment_link', { p_token: token })
    .abortSignal(signal)
  if (error) throw new Error('No se pudo comprobar el enlace.')
  return data as PublicAppointment | null
}

export async function respondToAppointmentLink(
  token: string,
  respond: AppointmentResponse,
  localStart?: string,
): Promise<PublicAppointment | null> {
  if (!validAppointmentToken(token)) return null
  const { data, error } = await anonymousAppointmentClient().rpc('respond_visit_appointment_link', {
    p_token: token,
    p_response: respond,
    p_local_start: localStart ?? null,
  })
  if (error?.code === 'P0409') return null
  if (data?.error === 'rate_limited')
    throw new Error('Espera unos segundos antes de volver a intentarlo.')
  if (data?.error === 'invalid_proposal' || error?.code === '22023')
    throw new Error('Elige otra fecha y hora local válida dentro de los próximos 90 días.')
  if (error) throw new Error('No se pudo confirmar la respuesta. Puedes reintentar sin duplicarla.')
  return data as PublicAppointment | null
}
