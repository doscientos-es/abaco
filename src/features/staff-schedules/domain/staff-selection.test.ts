import { describe, expect, it } from 'vitest'

import { defaultStaffSelection, selectedStaffIds } from './staff-selection'

const people = ['ana', 'luis', 'bea'].map((userId) => ({ userId, name: userId, schedule: null }))
const teams = [
  { id: 'north', name: 'Norte', memberIds: ['ana', 'luis', 'outsider'] },
  { id: 'south', name: 'Sur', memberIds: ['luis', 'bea'] },
]

describe('schedule selection', () => {
  it('opens small companies with everyone and large companies with explicit selection', () => {
    expect(defaultStaffSelection(people).personIds).toEqual(['ana', 'luis', 'bea'])
    const company = Array.from({ length: 150 }, (_, index) => ({ userId: String(index) }))
    expect(defaultStaffSelection(company).personIds).toEqual([])
    expect(defaultStaffSelection(company, true).personIds).toHaveLength(150)
    expect(defaultStaffSelection([], true).personIds).toEqual([])
  })

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
