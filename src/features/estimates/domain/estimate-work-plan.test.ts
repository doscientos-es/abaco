import { describe, expect, it } from 'vitest'

import { emptyContractJob } from '@/features/contracts/domain/contract-job'
import type { EstimateLine } from '@/shared/domain/types'

import {
  estimateWorkPlanError,
  normalizeEstimateWorkPlan,
  type EstimateWorkPlan,
} from './estimate-work-plan'

const lines = [{ id: 'price' }] as EstimateLine[]
const start = '2026-01-01'
const plan = (): EstimateWorkPlan => ({
  startsOn: start,
  endsOn: '2026-12-31',
  jobs: [
    { ...emptyContractJob(start), title: 'Limpieza', tasks: 'Portales', location_id: 'centre' },
  ],
})

describe('planificación del presupuesto', () => {
  it('permite varios trabajos bajo una única partida económica', () => {
    const value = plan()
    value.jobs.push({
      ...emptyContractJob(start),
      title: 'Cristales',
      tasks: 'Cristales',
      location_id: 'centre',
    })
    expect(estimateWorkPlanError(value, lines)).toBeNull()
  })

  it('rechaza trabajos incompletos o fuera de la vigencia', () => {
    const value = plan()
    const job = value.jobs[0]
    if (!job) throw new Error('Trabajo ausente')
    job.anchor_on = '2027-01-01'
    expect(estimateWorkPlanError(value, lines)).toContain('fechas')
    job.anchor_on = start
    job.location_id = null
    expect(estimateWorkPlanError(value, lines)).toContain('centro')
  })

  it('conserva el alcance y normaliza cada trabajo antes de guardarlo', () => {
    const value = plan()
    const job = value.jobs[0]
    if (!job) throw new Error('Trabajo ausente')
    job.title = ' Limpieza '
    expect(normalizeEstimateWorkPlan(value).jobs[0]?.title).toBe('Limpieza')
    expect(normalizeEstimateWorkPlan(value).jobs[0]?.tasks).toBe('Portales')
  })
})
