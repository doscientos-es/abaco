import type { VisitPhoto, VisitPhotoPhase } from '../application/visit-photo-actions'
import type { VisitPhotoPair } from '../application/visit-photo-pair-actions'

export const visitPhotoPhases = ['before', 'after', 'other'] as const
export type PhotoChronology = 'newest' | 'oldest'

export const visitPhotoPhaseLabels: Record<VisitPhotoPhase, string> = {
  before: 'Antes',
  after: 'Después',
  other: 'Otra evidencia',
}

export function layoutVisitPhotos(
  photos: readonly VisitPhoto[],
  pairs: readonly VisitPhotoPair[],
  sort: PhotoChronology,
) {
  const byId = new Map(photos.map((photo) => [photo.id, photo]))
  const photoIds = new Set<string>()
  const matched = pairs
    .flatMap((pair) => {
      const before = byId.get(pair.before_photo_id)
      const after = byId.get(pair.after_photo_id)
      if (before?.phase !== 'before' || after?.phase !== 'after') return []
      if (photoIds.has(before.id) || photoIds.has(after.id)) return []
      photoIds.add(before.id)
      photoIds.add(after.id)
      return [{ before, after, pair }]
    })
    .sort(
      (a, b) =>
        chronologically(a.pair.created_at, b.pair.created_at, sort) ||
        a.before.id.localeCompare(b.before.id),
    )
  const unpaired: Record<VisitPhotoPhase, VisitPhoto[]> = { before: [], after: [], other: [] }
  photos
    .filter(({ id }) => !photoIds.has(id))
    .sort((a, b) => chronologically(a.created_at, b.created_at, sort) || a.id.localeCompare(b.id))
    .forEach((photo) => unpaired[photo.phase].push(photo))

  return { matched, unpaired }
}

function chronologically(left: string, right: string, sort: PhotoChronology) {
  const diff = Date.parse(left) - Date.parse(right)
  return sort === 'oldest' ? diff : -diff
}
