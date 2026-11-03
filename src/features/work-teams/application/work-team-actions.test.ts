import { describe, expect, it, vi } from 'vitest'

import {
  assignableWorkTeams,
  workTeamInput,
  type SaveWorkTeam,
  type WorkTeam,
} from '../domain/work-team'
import { createWorkTeamActions } from './work-team-actions'

const id = (value: number) => `63000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const input: SaveWorkTeam = {
  tenantId: id(1),
  id: id(2),
  expectedUpdatedAt: null,
  name: '  Mantenimiento  ',
  description: '  Revisiones  ',
  memberIds: [id(4), id(3), id(4)],
  archived: false,
  operationId: id(5),
}

describe('work team commands', () => {
  it('normalizes names and members before saving without changing retry identity', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const actions = createWorkTeamActions({ list: vi.fn(), save })
    await actions.save(input)
    expect(save).toHaveBeenCalledWith({
      ...input,
      name: 'Mantenimiento',
      description: 'Revisiones',
      memberIds: [id(3), id(4)],
    })
    expect(input.memberIds).toEqual([id(4), id(3), id(4)])
  })

  it.each([
    { name: '  ' },
    { name: 'x'.repeat(81) },
    { description: 'x'.repeat(1001) },
    { memberIds: [] },
    { memberIds: ['not-a-person-id'] },
    { tenantId: 'other' },
    { expectedUpdatedAt: 'yesterday' },
  ])('does not reach persistence with invalid data: %j', async (patch) => {
    const save = vi.fn()
    const actions = createWorkTeamActions({ list: vi.fn(), save })
    await expect(actions.save({ ...input, ...patch })).rejects.toThrow()
    expect(save).not.toHaveBeenCalled()
  })

  it('allows archiving an empty team after its last person leaves', () => {
    expect(workTeamInput.parse({ ...input, memberIds: [], archived: true }).archived).toBe(true)
  })

  it('propagates a persistence failure so the form can keep its data and retry', async () => {
    const actions = createWorkTeamActions({
      list: vi.fn(),
      save: vi.fn().mockRejectedValue(new Error('El equipo cambió')),
    })
    await expect(actions.save(input)).rejects.toThrow('El equipo cambió')
  })
})

describe('team assignment options', () => {
  const base: WorkTeam = {
    id: id(1),
    name: 'Equipo',
    description: '',
    memberIds: [id(3)],
    archived: false,
    updatedAt: '2026-11-03T09:00:00Z',
  }
  const teams = [
    base,
    { ...base, id: id(2), archived: true },
    { ...base, id: id(4), memberIds: [] },
  ]

  it('offers only active, staffed groups for a new assignment', () => {
    expect(assignableWorkTeams(teams, null).map((team) => team.id)).toEqual([id(1)])
  })

  it.each([id(2), id(4)])(
    'preserves the existing group %s even when it is no longer assignable',
    (currentId) => {
      expect(assignableWorkTeams(teams, currentId).map((team) => team.id)).toEqual([
        id(1),
        currentId,
      ])
    },
  )
})
