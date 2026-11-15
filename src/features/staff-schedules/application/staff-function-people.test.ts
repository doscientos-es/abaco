import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StaffPerson } from '../domain/staff-schedule'
import { saveFunctionPeople } from './staff-function-people'

const save = vi.hoisted(() => vi.fn())
vi.mock('./staff-schedule-actions', () => ({ saveStaffSchedule: save }))

const people: StaffPerson[] = [
  {
    userId: 'ana',
    name: 'Ana',
    schedule: {
      userId: 'ana',
      updatedAt: 'v1',
      slots: [{ weekday: 1, start: 540, end: 1020 }],
      functionIds: ['electric', 'water'],
    },
  },
  { userId: 'bea', name: 'Bea', schedule: null },
  {
    userId: 'carlos',
    name: 'Carlos',
    schedule: { userId: 'carlos', updatedAt: 'v2', slots: [], functionIds: ['electric'] },
  },
]

beforeEach(() => {
  save.mockReset()
  save.mockResolvedValue(undefined)
})

describe('saveFunctionPeople', () => {
  it('adds and removes only the selected function, preserving schedules and unrelated functions', async () => {
    expect(await saveFunctionPeople('company', 'electric', people, ['bea', 'carlos'])).toEqual([])
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledWith('company', 'ana', 'v1', people[0]?.schedule?.slots, ['water'])
    expect(save).toHaveBeenCalledWith('company', 'bea', null, [], ['electric'])
  })

  it('reports individual failures while still attempting the remaining changes', async () => {
    save.mockImplementation(async (_tenant: string, user: string) => {
      if (user === 'ana') throw new Error('El horario cambió')
    })
    expect(await saveFunctionPeople('company', 'electric', people, ['bea'])).toEqual([people[0]])
    expect(save).toHaveBeenCalledTimes(3)
  })

  it('limits concurrency when assigning a large team', async () => {
    let active = 0
    let maximum = 0
    save.mockImplementation(async () => {
      active += 1
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      active -= 1
    })
    const many = Array.from({ length: 13 }, (_, index) => ({
      userId: String(index),
      name: String(index),
      schedule: null,
    }))
    await saveFunctionPeople(
      'company',
      'electric',
      many,
      many.map((person) => person.userId),
    )
    expect(save).toHaveBeenCalledTimes(13)
    expect(maximum).toBe(5)
  })
})
