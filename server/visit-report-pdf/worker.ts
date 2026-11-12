import { projectClosedReport } from './projection'
import { renderVisitReport } from './render'
import { MAX_PHOTO_BYTES, record, UpstreamError, UUID, type SupabaseReportStore } from './upstream'

export async function renderPdfJob(store: SupabaseReportStore, job: Record<string, unknown>) {
  const tenant = String(job.tenant_id)
  const versionId = String(job.report_version_id)
  const path = store.objectPath(tenant, versionId)
  if (await store.exists(path)) return
  const query = new URLSearchParams({
    select: 'snapshot,version,closed_at',
    id: `eq.${versionId}`,
    tenant_id: `eq.${tenant}`,
    limit: '1',
  })
  const version = await store.one(`/rest/v1/service_visit_report_versions?${query}`)
  if (!version) throw new UpstreamError(404)
  const { report, photoPaths } = projectClosedReport(version)
  const visitId = record(record(version.snapshot).visit).id
  if (
    typeof visitId !== 'string' ||
    !UUID.test(visitId) ||
    photoPaths.some((photo) => !photo.startsWith(`${tenant}/${visitId}/`) || photo.includes('..'))
  ) {
    throw new Error('Photo does not belong to this visit')
  }
  const images: Buffer[] = []
  // Limit parallel downloads to four, retaining snapshot order.
  for (let i = 0; i < photoPaths.length; i += 4) {
    images.push(
      ...(await Promise.all(
        photoPaths.slice(i, i + 4).map(async (photo) => {
          const path = photo.split('/').map(encodeURIComponent).join('/')
          const result = await store.request(
            `/storage/v1/object/authenticated/visit-photos/${path}`,
            { limit: MAX_PHOTO_BYTES },
          )
          if (result.status !== 200) throw new UpstreamError()
          return result.data
        }),
      )),
    )
  }
  await store.upload(path, await renderVisitReport(report, images))
}

export async function processOnePdfJob(
  store: SupabaseReportStore,
): Promise<'idle' | 'retry' | 'ready'> {
  const claimed = await store.rpc('claim_service_visit_report_pdf_job', {})
  if (!Array.isArray(claimed) || !claimed.length) return 'idle'
  const job = record(claimed[0])
  let errorCode: string | null = null
  try {
    await renderPdfJob(store, job)
  } catch (error) {
    process.stderr.write(`PDF job failed: ${error instanceof Error ? error.name : 'Error'}\n`)
    errorCode = error instanceof UpstreamError ? 'source_unavailable' : 'render_failed'
  }
  const finished = await store.rpc('finish_service_visit_report_pdf_job', {
    p_report_version_id: job.report_version_id,
    p_lease_token: job.lease_token,
    p_ready: !errorCode,
    p_error_code: errorCode,
  })
  if (finished !== true) throw new UpstreamError()
  return errorCode ? 'retry' : 'ready'
}
