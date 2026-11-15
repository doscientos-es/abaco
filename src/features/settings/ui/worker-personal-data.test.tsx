import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkerPersonalDataSection } from './worker-personal-data'

const { state, query, invalidate, save, button, dialog, field } = vi.hoisted(() => ({
  state: vi.fn(),
  query: vi.fn(),
  invalidate: vi.fn(),
  save: vi.fn(),
  button: vi.fn(),
  dialog: vi.fn(),
  field: vi.fn(),
}))
vi.mock('react', async (original) => ({ ...(await original<typeof React>()), useState: state }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: query,
  useQueryClient: () => ({ invalidateQueries: invalidate }),
}))
vi.mock('@doscientos/ui', () => ({ Button: button }))
vi.mock('@/shared/ui/form', () => ({ TextField: field }))
vi.mock('@/shared/ui/form-dialog', () => ({ FormDialog: dialog }))
vi.mock('../application/worker-personal-data-actions', () => ({
  workerPersonalDataQuery: (tenant: string, worker: string) => ({
    queryKey: ['worker-personal-data', tenant, worker],
  }),
  saveWorkerPersonalData: save,
}))

describe('worker personal data', () => {
  let values: unknown[]
  let cursor: number
  function render() {
    cursor = 0
    button.mockClear()
    dialog.mockClear()
    field.mockClear()
    return renderToStaticMarkup(<WorkerPersonalDataSection tenantId="company" workerId="ana" />)
  }
  beforeEach(() => {
    vi.resetAllMocks()
    values = []
    state.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in values)) values[index] = initial
      return [
        values[index],
        (value: unknown) => {
          values[index] = value
        },
      ]
    })
    button.mockImplementation(({ children }: { children: React.ReactNode }) => (
      <button>{children}</button>
    ))
    dialog.mockImplementation(({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div>{children}</div> : null,
    )
    field.mockImplementation(({ label }: { label: string }) => <span>{label}</span>)
    invalidate.mockResolvedValue(undefined)
  })

  it('warns only after successfully loading an existing worker without DNI', () => {
    query.mockReturnValue({ isPending: true })
    expect(render()).not.toContain('Falta el DNI')
    query.mockReturnValue({ isError: true })
    expect(render()).toContain('No se pudieron cargar')
    query.mockReturnValue({ data: { dni: '', phone: '' } })
    expect(render()).toContain('Falta el DNI')
    query.mockReturnValue({ data: { dni: '12345678Z', phone: '' } })
    expect(render()).not.toContain('Falta el DNI')
  })

  it('requires DNI and saves with an optional phone', async () => {
    query.mockReturnValue({ data: { dni: '', phone: '' } })
    save.mockResolvedValue(undefined)
    render()
    button.mock.calls[0]?.[0].onPress()
    render()
    expect(dialog.mock.calls[0]?.[0].submitDisabled).toBe(true)
    field.mock.calls.find(([props]) => props.label === 'DNI')?.[0].onChange('12345678Z')
    render()
    expect(dialog.mock.calls[0]?.[0].submitDisabled).toBe(false)
    dialog.mock.calls[0]?.[0].onSubmit()
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith('company', 'ana', { dni: '12345678Z', phone: '' }),
    )
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['worker-personal-data', 'company', 'ana'],
    })
  })
})
