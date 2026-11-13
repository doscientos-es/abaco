import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StaffSelection } from '@/features/staff-schedules'
import type { WorkTeam } from '@/features/work-teams'

import { WorkerVacations } from './worker-vacations'

const mocks = vi.hoisted(() => ({
  selection: undefined as StaffSelection | undefined,
  filter: vi.fn(),
  calendar: vi.fn(),
}))
vi.mock('react', async (load) => ({
  ...(await load<typeof React>()),
  useState: () => [
    mocks.selection,
    (selection: StaffSelection) => {
      mocks.selection = selection
    },
  ],
}))
vi.mock('@/features/staff-schedules', async () => ({
  ...(await import('../../staff-schedules/domain/staff-selection')),
  StaffPeopleFilter: mocks.filter,
}))
vi.mock('@/features/vacations', () => ({ VacationManagementPage: mocks.calendar }))

const people = Array.from({ length: 150 }, (_, index) => ({
  userId: `person-${index}`,
  fullName: `Persona ${index}`,
  email: `${index}@example.com`,
  role: 'user' as const,
}))
const teams: WorkTeam[] = [
  {
    id: 'north',
    name: 'Norte',
    description: '',
    memberIds: ['person-0', 'person-1'],
    archived: false,
    updatedAt: 'v1',
  },
]

describe('worker absence scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selection = undefined
    mocks.filter.mockReturnValue(null)
    mocks.calendar.mockReturnValue(null)
  })

  it('shows the whole company for a small workforce', () => {
    renderToStaticMarkup(<WorkerVacations people={people.slice(0, 10)} teams={teams} />)
    expect(mocks.calendar.mock.calls[0]?.[0].memberIds).toHaveLength(10)
  })

  it('waits for explicit selection with 150 people and resolves a selected team', () => {
    const render = () => renderToStaticMarkup(<WorkerVacations people={people} teams={teams} />)
    expect(render()).toContain('Selecciona personas o equipos')
    expect(mocks.calendar).not.toHaveBeenCalled()
    mocks.filter.mock.calls[0]?.[0].onChange({ personIds: [], teamIds: ['north'] })
    render()
    expect(mocks.calendar.mock.calls[0]?.[0].memberIds).toEqual(['person-0', 'person-1'])
  })

  it('opens a team with all its people, excluding other company members', () => {
    renderToStaticMarkup(<WorkerVacations people={people} teams={teams} memberIds={['person-0']} />)
    expect(mocks.calendar.mock.calls[0]?.[0].memberIds).toEqual(['person-0'])
    expect(mocks.filter.mock.calls[0]?.[0].teams[0].memberIds).toEqual(['person-0'])
  })

  it('does not fall back to the company for an empty team', () => {
    renderToStaticMarkup(<WorkerVacations people={people} teams={teams} memberIds={[]} />)
    expect(mocks.calendar).not.toHaveBeenCalled()
    expect(mocks.filter.mock.calls[0]?.[0].people).toEqual([])
  })
})
