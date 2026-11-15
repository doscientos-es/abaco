import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkerVacationAllowance } from './worker-vacation-allowance'

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  query: vi.fn(),
  invalidate: vi.fn(),
  save: vi.fn(),
  button: vi.fn(),
  dialog: vi.fn(),
  field: vi.fn(),
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: mocks.state,
}))
vi.mock('@tanstack/react-query', () => ({
  queryOptions: (options: unknown) => options,
  useQuery: mocks.query,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}))
vi.mock('@doscientos/ui', () => ({ Button: mocks.button }))
vi.mock('@/shared/ui/form', () => ({ TextField: mocks.field }))
vi.mock('@/shared/ui/form-dialog', () => ({ FormDialog: mocks.dialog }))
vi.mock('../application/vacation-allowance-actions', async (original) => ({
  ...(await original<object>()),
  saveVacationAllowance: mocks.save,
}))

describe('cupo de vacaciones de una persona', () => {
  let values: unknown[]
  let cursor: number
  function render() {
    cursor = 0
    mocks.button.mockClear()
    mocks.dialog.mockClear()
    mocks.field.mockClear()
    return renderToStaticMarkup(<WorkerVacationAllowance tenantId="empresa" workerId="ana" />)
  }
  beforeEach(() => {
    vi.resetAllMocks()
    values = []
    mocks.state.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in values)) values[index] = initial
      return [
        values[index],
        (value: unknown) => {
          values[index] = value
        },
      ]
    })
    mocks.button.mockImplementation(({ children }: { children: React.ReactNode }) => (
      <button>{children}</button>
    ))
    mocks.dialog.mockImplementation(
      ({ open, children }: { open: boolean; children: React.ReactNode }) =>
        open ? <div>{children}</div> : null,
    )
    mocks.field.mockImplementation(({ label }: { label: string }) => <span>{label}</span>)
    mocks.invalidate.mockResolvedValue(undefined)
    mocks.save.mockResolvedValue(undefined)
  })

  it('shows the default only after loading and reports errors', () => {
    mocks.query.mockReturnValue({ isPending: true })
    expect(render()).not.toContain('23 días')
    mocks.query.mockReturnValue({ isError: true })
    expect(render()).toContain('No se pudo cargar')
    mocks.query.mockReturnValue({ data: [] })
    expect(render()).toContain('23 días')
    mocks.query.mockReturnValue({ data: [{ worker_id: 'ana', annual_days: 0 }] })
    expect(render()).toContain('0 días')
  })

  it('validates and saves the configured allowance, invalidating the shared query', async () => {
    mocks.query.mockReturnValue({ data: [] })
    render()
    mocks.button.mock.calls[0]?.[0].onPress()
    render()
    mocks.field.mock.calls[0]?.[0].onChange('-1')
    render()
    expect(mocks.dialog.mock.calls[0]?.[0].submitDisabled).toBe(true)
    mocks.field.mock.calls[0]?.[0].onChange('28')
    render()
    expect(mocks.dialog.mock.calls[0]?.[0].submitDisabled).toBe(false)
    mocks.dialog.mock.calls[0]?.[0].onSubmit()
    await vi.waitFor(() =>
      expect(mocks.invalidate).toHaveBeenCalledWith({
        queryKey: ['vacation-allowances', 'empresa'],
      }),
    )
    expect(mocks.save).toHaveBeenCalledWith('empresa', 'ana', 28)
  })
})
