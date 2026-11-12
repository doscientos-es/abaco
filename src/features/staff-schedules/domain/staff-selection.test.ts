import { describe, expect, it } from 'vitest'

import { selectedStaffIds } from './staff-selection'

const people = ['ana', 'luis', 'bea'].map((userId) => ({ userId, name: userId, schedule: null }))
const teams = [
  { id: 'north', name: 'Norte', memberIds: ['ana', 'luis', 'outsider'] },
  { id: 'south', name: 'Sur', memberIds: ['luis', 'bea'] },
]

describe('schedule selection', () => {
  it('starts empty instead of including the whole company', () => {
    expect(selectedStaffIds(people, teams, { personIds: [], teamIds: [] }).size).toBe(0)
  })

  it('combines people and overlapping teams once, ignoring nonmembers', () => {
    expect([
      ...selectedStaffIds(people, teams, {
        personIds: ['ana', 'unknown'],
        teamIds: ['north', 'south'],
      }),
    ]).toEqual(['ana', 'luis', 'bea'])
  })

  it('preserves explicit people and another team when a team is removed', () => {
    expect([
      ...selectedStaffIds(people, teams, {
        personIds: ['ana'],
        teamIds: ['south', 'deleted-team'],
      }),
    ]).toEqual(['ana', 'luis', 'bea'])
    expect([
      ...selectedStaffIds(people, teams, {
        personIds: [],
        teamIds: ['south'],
      }),
    ]).toEqual(['luis', 'bea'])
  })
})
