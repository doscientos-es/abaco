import {
  contractJobError,
  normalizeContractJob,
  type ContractJobDraft,
} from '@/features/contracts/domain/contract-job'
import { contractDatesError } from '@/features/contracts/domain/weekly-schedule'
import type { EstimateLine } from '@/shared/domain/types'

/** Operational instructions are kept separately from priced lines: one price can cover many jobs. */
export type EstimateWorkPlan = {
  startsOn: string
  endsOn: string
  jobs: ContractJobDraft[]
}

export function estimateWorkPlanError(
  plan: EstimateWorkPlan,
  lines: EstimateLine[],
): string | null {
  const dates = contractDatesError(plan.startsOn, plan.endsOn)
  if (dates) return dates
  if (!lines.length) return 'Añade al menos una partida económica.'
  if (!plan.jobs.length) return 'Añade al menos un trabajo para planificar el servicio.'
  for (const [index, job] of plan.jobs.entries()) {
    const error = contractJobError(job, plan.startsOn, plan.endsOn)
    if (error) return `Trabajo ${index + 1}: ${error}`
  }
  return null
}

export function normalizeEstimateWorkPlan(plan: EstimateWorkPlan): EstimateWorkPlan {
  return { ...plan, jobs: plan.jobs.map(normalizeContractJob) }
}
