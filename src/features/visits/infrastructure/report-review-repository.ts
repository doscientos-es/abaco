import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type PendingReportReview = {
  report_version_id: string
  visit_id: string
  version: number
  closed_at: string
  visit_title: string | null
  client_name: string | null
}

const pageSize = 20

export async function listPendingReportReviews(tenantId: string, page: number) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'list_pending_visit_report_reviews',
    {
      p_tenant_id: tenantId,
      p_offset: page * pageSize,
    },
  )
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as PendingReportReview[]
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize }
}

export async function reviewClosedReport(tenantId: string, reportVersionId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('review_closed_visit_report', {
    p_tenant_id: tenantId,
    p_report_version_id: reportVersionId,
  })
  if (error || data !== true) throw new Error(error?.message ?? 'No se pudo confirmar la revisión.')
}

export async function downloadClosedReportPdf(tenantId: string, reportVersionId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .storage.from('visit-report-pdfs')
    .download(`${tenantId}/${reportVersionId}.pdf`)
  if (error || !data) throw new Error('El PDF aún no está disponible o no se pudo descargar.')
  return data
}
