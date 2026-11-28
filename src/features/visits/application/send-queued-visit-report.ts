import {
  loadVisitReport,
  loadVisitReportReceipt,
  requireVisitReportActor,
  saveVisitReport,
  type VisitReport,
} from './visit-report-actions'
import { equalVisitReportData, type LocalVisitReportDraft } from './visit-report-local-draft'
import { requireOpenAssignedVisit } from './worker-offline-day'

type QueuedReportCommand = {
  tenantId: string
  userId: string
  visitId: string
  day: string
  draft: LocalVisitReportDraft
  stillActive: () => boolean
}

export type QueuedReportResult =
  | { state: 'received'; revision: number; serverReport: VisitReport | null }
  | { state: 'conflict'; serverReport: VisitReport | null }

export async function sendQueuedVisitReport({
  tenantId,
  userId,
  visitId,
  day,
  draft,
  stillActive,
}: QueuedReportCommand): Promise<QueuedReportResult> {
  async function checkScope() {
    await requireVisitReportActor(userId)
    if (!stillActive())
      throw new Error('La jornada ha cambiado. Vuelve a abrir el parte antes de enviar.')
  }

  async function receipt() {
    const found = await loadVisitReportReceipt({
      tenantId,
      userId,
      visitId,
      operationId: draft.operationId,
    })
    if (!found) return null
    if (
      found.expected_revision !== draft.baseRevision ||
      found.revision !== draft.baseRevision + 1 ||
      !equalVisitReportData(found.data, draft.data)
    ) {
      throw new Error('El acuse no corresponde a esta versión. Se conserva el borrador local.')
    }
    return found.revision
  }

  await checkScope()
  await requireOpenAssignedVisit(tenantId, visitId, day)
  const acknowledged = await receipt()
  if (acknowledged !== null) {
    const serverReport = await loadVisitReport(tenantId, visitId)
    await checkScope()
    return { state: 'received', revision: acknowledged, serverReport }
  }
  const serverReport = await loadVisitReport(tenantId, visitId)
  if ((serverReport?.revision ?? 0) !== draft.baseRevision) {
    return { state: 'conflict', serverReport }
  }
  await checkScope()
  try {
    const revision = await saveVisitReport({
      tenantId,
      visitId,
      operationId: draft.operationId,
      expectedRevision: draft.baseRevision,
      data: draft.data,
    })
    if (revision !== draft.baseRevision + 1)
      throw new Error('La respuesta no confirma la revisión esperada.')
    return { state: 'received', revision, serverReport: null }
  } catch (error) {
    // The network may have lost the response after commit. Content equality alone
    // is not an acknowledgement; the exact actor and operation must match.
    const confirmed = await receipt().catch(() => null)
    if (confirmed !== null)
      return {
        state: 'received',
        revision: confirmed,
        serverReport: await loadVisitReport(tenantId, visitId),
      }
    const fresh = await loadVisitReport(tenantId, visitId).catch(() => undefined)
    if (fresh !== undefined && (fresh?.revision ?? 0) !== draft.baseRevision)
      return { state: 'conflict', serverReport: fresh }
    throw error
  }
}
