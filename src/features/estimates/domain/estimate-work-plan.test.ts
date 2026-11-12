import { describe, expect, it } from 'vitest'

import { emptyContractJob } from '@/features/contracts/domain/contract-job'
import type { EstimateLine } from '@/shared/domain/types'

import { estimateWorkPlanError, normalizeEstimateWorkPlan } from './estimate-work-plan'

const lines = [{ id: 'price' }] as EstimateLine[]
const start = '2026-01-01'
const plan = () => ({
  startsOn: start,
  endsOn: '2026-12-31',
  jobs: [
    { ...emptyContractJob(start), title: 'Limpieza', tasks: 'Portales', location_id: 'centre' },
  ],
})

describe('planificación del presupuesto', () => {
  it('permite varios trabajos bajo una única partida económica', () => {
    const value = plan()
    value.jobs.push({ ...value.jobs[0], title: 'Cristales' })
    expect(estimateWorkPlanError(value, lines)).toBeNull()
  })

  it('rechaza trabajos incompletos o fuera de la vigencia', () => {
    const value = plan()
    value.jobs[0].anchor_on = '2027-01-01'
    expect(estimateWorkPlanError(value, lines)).toContain('fechas')
    value.jobs[0].anchor_on = start
    value.jobs[0].location_id = null
    expect(estimateWorkPlanError(value, lines)).toContain('centro')
  })

  it('conserva el alcance y normaliza cada trabajo antes de guardarlo', () => {
    const value = plan()
    value.jobs[0].title = ' Limpieza '
    expect(normalizeEstimateWorkPlan(value).jobs[0].title).toBe('Limpieza')
    expect(normalizeEstimateWorkPlan(value).jobs[0].tasks).toBe('Portales')
  })
})
