import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StaffFunction, StaffPerson, StaffSchedule } from '../domain/staff-schedule'
import { StaffMemberFunctionsDialog } from './staff-member-functions-dialog'

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  save: vi.fn(),
  invalidate: vi.fn(),
  close: vi.fn(),
  submit: null as null | (() => void),
  change: null as null | ((ids: string[]) => void),
  disabled: false,
}))

vi.mock('react', async (load) => ({
  ...(await load<typeof React>()),
  useState: (initial: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states))
      mocks.states[index] = typeof initial === 'function' ? initial() : initial
    return [
      mocks.states[index],
      (value: unknown) => {
        mocks.states[index] = typeof value === 'function' ? value(mocks.states[index]) : value
      },
    ]
  },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}))
vi.mock('../application/staff-schedule-actions', () => ({
  saveStaffSchedule: mocks.save,
  staffSchedulesQuery: (tenantId: string) => ({ queryKey: ['staff-schedules', tenantId] }),
}))
vi.mock('@/shared/ui/form-dialog', () => ({
  FormDialog: ({
    children,
    onSubmit,
    submitDisabled,
  }: {
    children: ReactNode
    onSubmit: () => void
    submitDisabled: boolean
  }) => {
    mocks.submit = onSubmit
    mocks.disabled = submitDisabled
    return <div>{children}</div>
  },
}))
vi.mock('./staff-function-picker', () => ({
  StaffFunctionPicker: ({
    selected,
    onChange,
  }: {
    selected: string[]
    onChange: (ids: string[]) => void
  }) => {
    mocks.change = onChange
    return <span>{selected.join(',')}</span>
  },
}))

const functions: StaffFunction[] = [
  { id: 'electric', name: 'Electricidad' },
  { id: 'water', name: 'Fontanería' },
]
const schedule: StaffSchedule = {
  userId: 'ana',
  updatedAt: 'v1',
  functionIds: ['electric'],
  slots: [{ weekday: 1, start: 540, end: 1020 }],
}
const person: StaffPerson = { userId: 'ana', name: 'Ana', schedule }

function render(value = person) {
  mocks.cursor = 0
  return renderToStaticMarkup(
    <StaffMemberFunctionsDialog
      tenantId="company"
      person={value}
      functions={functions}
      onClose={mocks.close}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.states = []
  mocks.save.mockResolvedValue(undefined)
  mocks.invalidate.mockResolvedValue(undefined)
})

describe('person function assignments', () => {
  it('saves multiple functions without changing the schedule and uses the opened version', async () => {
    expect(render()).toContain('electric')
    expect(mocks.disabled).toBe(true)
    mocks.change?.(['electric', 'water'])
    render({ ...person, schedule: { ...schedule, updatedAt: 'v2', slots: [] } })
    expect(mocks.disabled).toBe(false)
    mocks.submit?.()
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce())
    expect(mocks.save).toHaveBeenCalledWith('company', 'ana', 'v1', person.schedule?.slots, [
      'electric',
      'water',
    ])
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['staff-schedules', 'company'] })
  })

  it('can remove all functions and shows a concurrency error without closing', async () => {
    mocks.save.mockRejectedValue(new Error('El horario cambió; recarga antes de guardar'))
    render()
    mocks.change?.([])
    render()
    mocks.submit?.()
    await vi.waitFor(() =>
      expect(render()).toContain('El horario cambió; recarga antes de guardar'),
    )
    expect(mocks.save).toHaveBeenCalledWith('company', 'ana', 'v1', person.schedule?.slots, [])
    expect(mocks.close).not.toHaveBeenCalled()
  })

  it('assigns functions to a person without a schedule', async () => {
    render({ ...person, schedule: null })
    mocks.change?.(['electric', 'water'])
    render({ ...person, schedule: null })
    mocks.submit?.()
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce())
    expect(mocks.save).toHaveBeenCalledWith('company', 'ana', null, [], ['electric', 'water'])
  })
})
