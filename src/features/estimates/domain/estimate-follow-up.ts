import type { Estimate } from '@/shared/domain/types'

export type EstimateFollowUp = 'todos' | 'sin-respuesta' | 'fecha-pasada'
type FollowableEstimate = Pick<Estimate, 'status' | 'validUntil'>

export function validateEstimateFollowUpSearch(search: Record<string, unknown>): {
  seguimiento?: Exclude<EstimateFollowUp, 'todos'>
} {
  const v = search.seguimiento
  return v === 'sin-respuesta' || v === 'fecha-pasada' ? { seguimiento: v } : {}
}

export function hasEstimateValidity(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
}

export function matchesEstimateFollowUp(
  estimate: FollowableEstimate,
  scope: EstimateFollowUp,
  today: string,
): boolean {
  return (
    scope === 'todos' ||
    (estimate.status === 'sent' &&
      (scope === 'sin-respuesta' ||
        (hasEstimateValidity(estimate.validUntil) && estimate.validUntil < today)))
  )
}

export function compareEstimateValidity(a: FollowableEstimate, b: FollowableEstimate): number {
  const first = hasEstimateValidity(a.validUntil) ? a.validUntil : '9999-12-31'
  const second = hasEstimateValidity(b.validUntil) ? b.validUntil : '9999-12-31'
  return first.localeCompare(second)
}
