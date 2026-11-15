import type * as React from 'react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StaffFunctionPeopleDialog } from './staff-function-people-dialog'

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  selected: [] as string[],
  change: null as null | ((ids: string[]) => void),
  submit: null as null | (() => void),
  disabled: false,
  buttons: {} as Record<string, () => void>,
  save: vi.fn(),
  invalidate: vi.fn(),
  close: vi.fn(),
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
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === 'team'
      ? {
          isSuccess: true,
          data: [
            { userId: 'ana', fullName: 'Ana', email: 'ana@example.test' },
            { userId: 'bea', fullName: 'Bea', email: 'bea@example.test' },
          ],
        }
      : {
          isSuccess: true,
          data: [{ userId: 'ana', updatedAt: 'v1', slots: [], functionIds: ['electric'] }],
        },
}))
vi.mock('@/features/settings/application/team-actions', () => ({
  teamQuery: () => ({ queryKey: ['team'] }),
}))
vi.mock('../application/staff-schedule-actions', () => ({
  staffSchedulesQuery: (id: string) => ({ queryKey: ['staff-schedules', id] }),
}))
vi.mock('../application/staff-function-people', () => ({ saveFunctionPeople: mocks.save }))
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
vi.mock('@/shared/ui/multi-select-field', () => ({
  MultiSelectField: ({
    value,
    onChange,
  }: {
    value: string[]
    onChange: (ids: string[]) => void
  }) => {
    mocks.selected = value
    mocks.change = onChange
    return <span>{value.join(',')}</span>
  },
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children, onPress }: { children: string; onPress: () => void }) => {
    mocks.buttons[children] = onPress
    return <button>{children}</button>
  },
}))

function render() {
  mocks.cursor = 0
  return renderToStaticMarkup(
    <StaffFunctionPeopleDialog
      tenantId="company"
      staffFunction={{ id: 'electric', name: 'Electricidad' }}
      onClose={mocks.close}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.states = []
  mocks.buttons = {}
  mocks.save.mockResolvedValue([])
  mocks.invalidate.mockResolvedValue(undefined)
})

describe('function people dialog', () => {
  it('loads current assignments and saves a selection for multiple people', async () => {
    render()
    expect(mocks.selected).toEqual(['ana'])
    expect(mocks.disabled).toBe(true)
    mocks.buttons['Seleccionar todos']?.()
    render()
    expect(mocks.selected).toEqual(['ana', 'bea'])
    expect(mocks.disabled).toBe(false)
    mocks.submit?.()
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce())
    expect(mocks.save).toHaveBeenCalledWith('company', 'electric', expect.any(Array), [
      'ana',
      'bea',
    ])
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['staff-schedules', 'company'] })
  })

  it('reports partial failures and prevents retrying against stale versions', async () => {
    mocks.save.mockResolvedValue([{ userId: 'ana', name: 'Ana', schedule: null }])
    render()
    mocks.buttons['Quitar todos']?.()
    render()
    mocks.submit?.()
    await vi.waitFor(() => expect(render()).toContain('No se pudieron actualizar: Ana'))
    expect(mocks.disabled).toBe(true)
    expect(mocks.close).not.toHaveBeenCalled()
    expect(mocks.invalidate).toHaveBeenCalledOnce()
  })
})
