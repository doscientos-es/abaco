import { describe, expect, it } from 'vitest'

import {
  assignmentConflicts,
  matchAvailableWorkers,
  type AssignmentCandidate,
} from './worker-availability'

const occurrence = {
  date: '2026-11-16',
  weekday: 1,
  startMinute: 540,
  endMinute: 600,
  startTimestamp: 100,
  endTimestamp: 200,
}
const person = (userId: string, functionIds: string[]): AssignmentCandidate => ({
  userId,
  functionIds,
  slots: [{ weekday: 1, start: 480, end: 1020 }],
  absences: [],
  busy: [],
})

describe('worker availability', () => {
  it('checks the full overnight shift and absences on the following day', () => {
    const night = { ...occurrence, startMinute: 1380, endMinute: 1500 }
    const candidate = {
      ...person('a', []),
      slots: [
        { weekday: 1, start: 1320, end: 1440 },
        { weekday: 2, start: 0, end: 120 },
      ],
    }
    expect(assignmentConflicts(candidate, night)).toEqual([])
    expect(
      assignmentConflicts(
        { ...candidate, absences: [{ startDate: '2026-11-17', endDate: '2026-11-17' }] },
        night,
      ),
    ).toEqual(['absence'])
    expect(
      assignmentConflicts({ ...candidate, slots: candidate.slots.slice(0, 1) }, night),
    ).toEqual(['schedule'])
  })
  it('detects approved absence, missing coverage and overlapping work, but permits adjacent work', () => {
    expect(
      assignmentConflicts(
        {
          ...person('a', []),
          absences: [{ startDate: '2026-11-01', endDate: null }],
          slots: [],
          busy: [{ start: 199, end: 210 }],
        },
        occurrence,
      ),
    ).toEqual(['absence', 'schedule', 'busy'])
    expect(
      assignmentConflicts(
        {
          ...person('a', []),
          busy: [
            { start: 0, end: 100 },
            { start: 200, end: 300 },
          ],
        },
        occurrence,
      ),
    ).toEqual([])
  })
  it('finds a full allocation even if one person can cover both roles', () => {
    expect(
      matchAvailableWorkers(
        [person('a', ['clean', 'windows']), person('b', ['clean'])],
        occurrence,
        ['clean', 'windows'],
        () => 0.99,
      ),
    ).toEqual(['b', 'a'])
  })
  it('does not assign one person twice or return a partial allocation', () => {
    expect(
      matchAvailableWorkers([person('a', ['clean'])], occurrence, ['clean', 'clean']),
    ).toBeNull()
  })
})
