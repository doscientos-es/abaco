import { workTeamActions } from '@/features/work-teams/application/work-team-actions'

import {
  batchAgendaRange,
  evaluateVisitBatch,
  maxBatchVisits,
  proposeVisitShift,
  type BatchVisitProposal,
} from '../domain/batch-visit-replan'
import {
  loadBatchBlockingAbsences,
  writeBatchVisitReplan,
} from '../infrastructure/batch-visit-replan-repository'
import { listPlanningVisits, type VisitSummary } from './visit-actions'

export async function prepareVisitBatch(tenantId: string, visits: VisitSummary[], minutes: number) {
  if (
    visits.length < 2 ||
    visits.length > maxBatchVisits ||
    new Set(visits.map(({ id }) => id)).size !== visits.length
  ) {
    throw new Error(`Selecciona entre 2 y ${maxBatchVisits} visitas distintas.`)
  }
  const slots = visits.map((visit) => proposeVisitShift(visit, minutes))
  if (slots.some(({ target }) => target === null)) return { slots, sequence: [] }
  const range = batchAgendaRange(slots)
  if (!range) throw new Error('No se pudo comprobar el rango de la propuesta.')
  const [scheduled, teams, absences] = await Promise.all([
    listPlanningVisits(tenantId, range.from, range.to, null),
    workTeamActions.list(tenantId),
    loadBatchBlockingAbsences(tenantId, range.from, range.to),
  ])
  return evaluateVisitBatch(slots, scheduled, teams, absences)
}

export type BatchVisitResult = {
  id: string
  status: 'applied' | 'rejected' | 'unconfirmed' | 'blocked'
  detail: string
}

export function canRetryBatchVisit(
  result: BatchVisitResult,
  all: BatchVisitResult[],
  proposal: BatchVisitProposal,
): boolean {
  if (result.status === 'unconfirmed') return true
  if (result.status !== 'blocked') return false
  const row = proposal.slots.find(({ visit }) => visit.id === result.id)
  return !!row?.dependsOn.every((id) => {
    const dependency = all.find((candidate) => candidate.id === id)
    return (
      dependency?.status === 'applied' ||
      (!!dependency && canRetryBatchVisit(dependency, all, proposal))
    )
  })
}

const definitiveErrors = new Set(['22023', '23505', '28000', '42501', 'P0002', 'P0402', 'P0409'])

export async function applyVisitBatch({
  tenantId,
  proposal,
  operations,
  previous,
  onResult,
}: {
  tenantId: string
  proposal: BatchVisitProposal
  operations: Map<string, string>
  previous: BatchVisitResult[]
  onResult: (result: BatchVisitResult) => void
}) {
  if (
    proposal.sequence.length !== proposal.slots.length ||
    proposal.slots.some(({ blockers }) => blockers.length)
  )
    return
  const resultById = new Map(previous.map((result) => [result.id, result]))
  const rows = new Map(proposal.slots.map((row) => [row.visit.id, row]))
  for (const id of proposal.sequence) {
    const row = rows.get(id)
    if (!row?.target) continue
    const existing = resultById.get(id)
    if (existing?.status === 'applied' || existing?.status === 'rejected') continue
    let result: BatchVisitResult
    if (row.dependsOn.some((dependency) => resultById.get(dependency)?.status !== 'applied')) {
      result = {
        id,
        status: 'blocked',
        detail: 'No se intentó: otra visita aún no ha liberado el horario.',
      }
    } else {
      const operationId = operations.get(id) ?? crypto.randomUUID()
      operations.set(id, operationId)
      try {
        await writeBatchVisitReplan({
          tenantId,
          visitId: id,
          expectedUpdatedAt: row.visit.updated_at,
          startAt: new Date(row.target.start).toISOString(),
          endAt: new Date(row.target.end).toISOString(),
          assignedUserId: row.visit.assigned_user_id ?? null,
          operationId,
        })
        result = { id, status: 'applied', detail: 'Cambio confirmado.' }
      } catch (error) {
        const code = (error as { code?: string } | null)?.code
        result = {
          id,
          status: code && definitiveErrors.has(code) ? 'rejected' : 'unconfirmed',
          detail:
            error instanceof Error ? error.message : 'No se recibió confirmación del servidor.',
        }
      }
    }
    resultById.set(id, result)
    onResult(result)
  }
}
