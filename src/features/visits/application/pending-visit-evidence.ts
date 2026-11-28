import { countPendingFieldEntries } from '@/features/field-entries/application/field-entry-queue'
import { countPendingVisitIncidents } from '@/features/incidents/application/incident-queue'

import { countPendingVisitPhotos } from './visit-photo-queue'

export const evidenceKinds = ['photos', 'incidents', 'activity'] as const
export type EvidenceKind = (typeof evidenceKinds)[number]

export function visitEvidenceAnchor(visitId: string, kind: EvidenceKind) {
  return `worker-evidence-${kind}-${visitId}`
}

export async function listLocalVisitEvidence(userId: string, tenantId: string) {
  const sources = await Promise.allSettled([
    countPendingVisitPhotos(userId, tenantId),
    Promise.resolve().then(() => countPendingVisitIncidents(userId, tenantId)),
    Promise.resolve().then(() => countPendingFieldEntries(userId, tenantId)),
  ])
  const byVisit = new Map<string, Partial<Record<EvidenceKind, number>>>()
  const unavailable: EvidenceKind[] = []
  for (const [index, kind] of evidenceKinds.entries()) {
    const source = sources[index]
    if (!source || source.status === 'rejected') {
      unavailable.push(kind)
      continue
    }
    for (const [visitId, count] of source.value) {
      byVisit.set(visitId, { ...byVisit.get(visitId), [kind]: count })
    }
  }
  return { byVisit, unavailable }
}
