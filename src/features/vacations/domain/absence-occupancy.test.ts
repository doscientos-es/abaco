import { describe, expect, it } from 'vitest'

import { absenceOccupancy, absencesInRange, overlappingEmployeeAbsences } from './absence-occupancy'
import type { VacationRequest } from './vacation-request'

function absence(id: string, requesterId: string, startDate: string, endDate: string | null, status: VacationRequest['status'] = 'approved'): VacationRequest {
  return {id,requesterId,requesterName:requesterId,startDate,endDate,status,absenceType:'vacation',comment:'',submittedAt:'2026-11-10T09:00:00Z',decisionComment:'',decidedAt:null,decidedByName:'',informationRequestComment:'',requesterResponseComment:''}
}

describe('absence occupancy', () => {
  const requests = [
    absence('a','ana','2026-11-01','2026-11-10'),
    absence('b','ana','2026-11-10','2026-11-12'),
    absence('c','bea','2026-11-12',null),
    absence('d','celia','2026-11-11','2026-11-13','pending'),
    absence('e','celia','2026-11-12',null,'needs_info'),
    absence('f','dani','2026-11-10','2026-11-12','rejected'),
    absence('g','eva','2026-11-10','2026-11-12','canceled'),
  ]

  it('counts distinct people per status group instead of counting periods', () => {
    const totals = absenceOccupancy(requests,'2026-11-10','2026-11-12')
    expect(totals.approvedPeople).toBe(2)
    expect(totals.pendingPeople).toBe(1)
    expect(totals.approved.map(r => r.id)).toEqual(['a','b','c'])
    expect(absenceOccupancy(requests,'2026-11-10','2026-11-10').approvedPeople).toBe(1)
    expect(absenceOccupancy(requests,'2026-11-11','2026-11-11').pendingPeople).toBe(1)
  })

  it('includes boundary dates and open periods without projecting them before their start', () => {
    expect(absencesInRange([requests[0]!],'2026-11-10','2026-11-10')).toHaveLength(1)
    expect(absencesInRange([requests[2]!],'2026-11-11','2026-11-11')).toHaveLength(0)
    expect(absencesInRange([requests[2]!],'2027-03-01','2027-03-02')).toHaveLength(1)
    expect(absencesInRange(requests,'2026-11-12','2026-11-10')).toEqual([])
  })

  it('warns only for active periods of the same person, excluding the edited period', () => {
    expect(overlappingEmployeeAbsences(requests,'ana','2026-11-10','2026-11-12','a').map(r => r.id)).toEqual(['b'])
    expect(overlappingEmployeeAbsences(requests,'dani','2026-11-10','2026-11-12')).toEqual([])
    expect(overlappingEmployeeAbsences(requests,'eva','2026-11-10','2026-11-12')).toEqual([])
    expect(overlappingEmployeeAbsences(requests,'bea','2026-11-10','')).toHaveLength(1)
    expect(overlappingEmployeeAbsences(requests,'bea','2026-11-10',null)).toHaveLength(1)
    expect(overlappingEmployeeAbsences(requests,'','2026-11-10',null)).toEqual([])
  })
})