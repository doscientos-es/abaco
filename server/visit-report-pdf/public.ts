import { createHash } from 'node:crypto'

import type { ReportProjection } from './projection'
import { renderVisitReport } from './render'
import { MAX_PHOTO_BYTES, PDF_BUCKET, record, SupabaseReportStore, UpstreamError } from './upstream'

async function liveShare(store: SupabaseReportStore, digest: string) {
  const query = new URLSearchParams({
    select: 'tenant_id,report_version_id,expires_at,revoked_at',
    token_hash: `eq.${digest}`,
    limit: '1',
  })
  const share = await store.one(`/rest/v1/service_visit_report_shares?${query}`)
  const expiry = typeof share?.expires_at === 'string' ? Date.parse(share.expires_at) : NaN
  return share && !share.revoked_at && Number.isFinite(expiry) && expiry > Date.now() ? share : null
}

export async function createOrGetPdf(token: string, store: SupabaseReportStore) {
  const digest = createHash('sha256').update(token, 'ascii').digest('hex')
  const share = await liveShare(store, digest)
  if (!share) throw new UpstreamError(404)
  const path = store.objectPath(String(share.tenant_id), String(share.report_version_id))
  if (!(await store.exists(path))) {
    const query = new URLSearchParams({
      select: 'snapshot',
      id: `eq.${share.report_version_id}`,
      tenant_id: `eq.${share.tenant_id}`,
      limit: '1',
    })
    const version = await store.one(`/rest/v1/service_visit_report_versions?${query}`)
    if (!version) throw new UpstreamError(404)
    const expectedPhotos = record(version.snapshot).photos
    const result = await store.json('/functions/v1/public-visit-report', { token })
    if (result.status === 404) throw new UpstreamError(404)
    const projection = record(result.data)
    if (
      result.status !== 200 ||
      !Array.isArray(projection.photos) ||
      projection.photos.length !== (Array.isArray(expectedPhotos) ? expectedPhotos.length : 0) ||
      projection.photos.length > 20
    )
      throw new UpstreamError()
    const origin = new URL(store.base).origin
    const images: Buffer[] = []
    for (const photo of projection.photos) {
      const url = record(photo).url
      if (typeof url !== 'string') throw new UpstreamError()
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        throw new UpstreamError()
      }
      if (
        parsed.origin !== origin ||
        !parsed.pathname.startsWith('/storage/v1/object/sign/visit-photos/')
      )
        throw new UpstreamError()
      const image = await store.request(parsed.href, { limit: MAX_PHOTO_BYTES })
      if (image.status !== 200) throw new UpstreamError()
      images.push(image.data)
    }
    await store.upload(path, await renderVisitReport(projection as ReportProjection, images))
  }
  const signed = await store.json(`/storage/v1/object/sign/${PDF_BUCKET}/${path}`, {
    expiresIn: 60,
  })
  const data = record(signed.data)
  const url = data.signedURL ?? data.signedUrl
  if (signed.status !== 200 || typeof url !== 'string' || !url.startsWith('/object/sign/'))
    throw new UpstreamError()
  if (!(await liveShare(store, digest))) throw new UpstreamError(404)
  return `${store.base}/storage/v1${url}${url.includes('?') ? '&' : '?'}download=parte-de-visita.pdf`
}
