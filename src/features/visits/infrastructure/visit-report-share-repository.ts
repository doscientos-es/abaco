import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type VisitReportShare = {
  id: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  active: boolean
}

export type VisitReportEmailDelivery = {
  id: string
  recipient_email: string
  status: 'queued' | 'sending' | 'retry' | 'sent' | 'failed' | 'uncertain'
  attempts: number
  created_at: string
  sent_at: string | null
  last_error_code: string | null
  provider_message_id: string | null
}

export type VisitReportEmailProviderEvent = {
  event_id: string
  provider_message_id: string
  recipient_email: string
  event_type: string
  occurred_at: string
}

export async function listVisitReportEmailProviderEvents(providerMessageIds: string[]) {
  if (!providerMessageIds.length) return []
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_visit_report_email_provider_events')
    .select('event_id,provider_message_id,recipient_email,event_type,occurred_at')
    .in('provider_message_id', providerMessageIds)
    .order('occurred_at', { ascending: false })
    .limit(1001)
  if (error) throw new Error(error.message)
  if ((data?.length ?? 0) > 1000) throw new Error('Demasiados eventos de entrega para esta página.')
  return (data ?? []) as VisitReportEmailProviderEvent[]
}

export type VisitReportPdfJob = {
  status: 'queued' | 'processing' | 'retry' | 'ready' | 'failed'
  attempts: number
  ready_at: string | null
}

export async function getVisitReportPdfJob(tenantId: string, reportVersionId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_visit_report_pdf_jobs')
    .select('status,attempts,ready_at')
    .eq('tenant_id', tenantId)
    .eq('report_version_id', reportVersionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as VisitReportPdfJob | null
}

export async function retryFailedVisitReportPdfJob(tenantId: string, reportVersionId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'retry_failed_service_visit_report_pdf_job',
    { p_tenant_id: tenantId, p_report_version_id: reportVersionId },
  )
  if (error) throw new Error(error.message)
  if (data !== true) throw new Error('El PDF ya no está pendiente de revisión.')
}

const pageSize = 20

export async function listVisitReportEmailDeliveries(
  tenantId: string,
  reportVersionId: string,
  page = 0,
) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_visit_report_email_deliveries')
    .select(
      'id,recipient_email,status,attempts,created_at,sent_at,last_error_code,provider_message_id',
    )
    .eq('tenant_id', tenantId)
    .eq('report_version_id', reportVersionId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize)
  if (error) throw new Error(error.message)
  return {
    items: (data ?? []).slice(0, pageSize) as VisitReportEmailDelivery[],
    hasMore: (data?.length ?? 0) > pageSize,
  }
}

export async function sendVisitReportEmail(input: {
  tenantId: string
  reportVersionId: string
  token: string
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().functions.invoke<{
    id: string
    status: VisitReportEmailDelivery['status']
    recipientEmail: string
  }>('send-visit-report', { body: input })
  if (error || !data?.id) throw new Error('No se pudo registrar el envío del informe.')
  return data
}

export async function listVisitReportShares(tenantId: string, reportVersionId: string, page = 0) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_visit_report_shares')
    .select('id,created_at,expires_at,revoked_at')
    .eq('tenant_id', tenantId)
    .eq('report_version_id', reportVersionId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize)
  if (error) throw new Error(error.message)
  const now = Date.now()
  return {
    items: (data ?? []).slice(0, pageSize).map((share) => ({
      ...share,
      active: !share.revoked_at && new Date(share.expires_at).getTime() > now,
    })) as VisitReportShare[],
    hasMore: (data?.length ?? 0) > pageSize,
  }
}

export function createReportShareAttempt() {
  return {
    token: createReportToken(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
    operationId: crypto.randomUUID(),
  }
}

export function createReportToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createVisitReportShare(input: {
  tenantId: string
  reportVersionId: string
  token: string
  expiresAt: string
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'create_service_visit_report_share',
    {
      p_tenant_id: input.tenantId,
      p_report_version_id: input.reportVersionId,
      p_token: input.token,
      p_expires_at: input.expiresAt,
      p_operation_id: input.operationId,
    },
  )
  if (error) throw new Error(error.message)
  return data as string
}

export async function revokeVisitReportShare(input: {
  tenantId: string
  shareId: string
  operationId: string
}) {
  const { error } = await createBrowserSupabaseClient().rpc('revoke_service_visit_report_share', {
    p_tenant_id: input.tenantId,
    p_share_id: input.shareId,
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
}
