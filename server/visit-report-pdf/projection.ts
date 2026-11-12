import {
  publicPhotoReferences,
  publicVisitReportSnapshot,
} from '../../supabase/functions/_shared/public-visit-report'
import { record } from './upstream'

export type ReportProjection = ReturnType<typeof publicVisitReportSnapshot>

/** Build the same allowlisted customer projection as the public report endpoint. */
export function projectClosedReport(version: Record<string, unknown>) {
  const snapshot = record(version.snapshot)
  const rawPhotos = Array.isArray(snapshot.photos) ? snapshot.photos : []
  const references = publicPhotoReferences(snapshot)
  if (rawPhotos.length > 20 || references.length !== rawPhotos.length) {
    throw new Error('Invalid report photos')
  }
  const report = publicVisitReportSnapshot(
    snapshot,
    typeof version.version === 'number' ? version.version : 1,
    typeof version.closed_at === 'string' ? version.closed_at : '',
    references.map(({ phase, caption }) => ({ phase, caption, url: '' })),
  )
  return { report, photoPaths: references.map(({ storagePath }) => storagePath) }
}
