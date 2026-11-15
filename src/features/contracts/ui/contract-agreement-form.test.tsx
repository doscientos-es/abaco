import type { FormEvent, ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { ServiceContract } from '../application/contract-actions'

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  invalidate: vi.fn(),
  states: [] as unknown[],
  cursor: 0,
  fields: new Map<string, (value: string) => void>(),
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: (value: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states)) mocks.states[index] = value
    return [
      mocks.states[index],
      (next: unknown) => {
        mocks.states[index] = next
      },
    ]
  },
  useRef: (value: unknown) => ({ current: value }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/shared/ui/form', () => ({
  TextField: ({ label, onChange }: { label: string; onChange: (value: string) => void }) => {
    mocks.fields.set(label, onChange)
    return <span>{label}</span>
  },
  TextareaField: ({ label, onChange }: { label: string; onChange: (value: string) => void }) => {
    mocks.fields.set(label, onChange)
    return <span>{label}</span>
  },
}))
vi.mock('../application/contract-actions', () => ({ updateDraftContractDetails: mocks.save }))

import { ContractAgreementForm } from './contract-agreement-form'

describe('contract summary form', () => {
  it.each(['pending', 'manual', 'automatic'] as const)(
    'hides renewal and preserves the existing %s value when saving',
    async (renewal) => {
      mocks.save.mockClear()
      mocks.cursor = 0
      mocks.states = []
      mocks.save.mockResolvedValue(undefined)
      mocks.invalidate.mockResolvedValue(undefined)
      const contract = {
        id: 'contract',
        tenant_id: 'tenant',
        starts_on: '2026-01-01',
        ends_on: '2026-12-31',
        renewal_mode: renewal,
        notes: 'Notas',
      } as ServiceContract
      const form = ContractAgreementForm({ contract })
      const html = renderToStaticMarkup(form)
      expect(html).not.toContain('Renovación')
      expect(html).toContain('Fecha de inicio')
      form.props.onSubmit({ preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>)
      await vi.waitFor(() =>
        expect(mocks.save).toHaveBeenCalledWith(
          expect.objectContaining({
            contract,
            renewal,
            startsOn: '2026-01-01',
            endsOn: '2026-12-31',
            notes: 'Notas',
          }),
        ),
      )
    },
  )

  it('saves changed dates and notes and closes only on success', async () => {
    mocks.states = []
    mocks.cursor = 0
    mocks.save.mockClear()
    mocks.save.mockResolvedValue(undefined)
    const onSaved = vi.fn()
    const contract = {
      id: 'contract',
      tenant_id: 'tenant',
      starts_on: '2026-01-01',
      ends_on: '2026-12-31',
      renewal_mode: 'manual',
      notes: 'Antes',
    } as ServiceContract
    renderToStaticMarkup(ContractAgreementForm({ contract, onSaved }))
    mocks.fields.get('Fecha de fin · obligatoria')?.('2027-01-31')
    mocks.fields.get('Notas (opcional)')?.('Después')
    mocks.cursor = 0
    const form = ContractAgreementForm({ contract, onSaved })
    form.props.onSubmit({ preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>)
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        endsOn: '2027-01-31',
        notes: 'Después',
        renewal: 'manual',
        contract,
      }),
    )
  })

  it('keeps the editor open when the save fails', async () => {
    mocks.states = []
    mocks.cursor = 0
    mocks.save.mockClear()
    mocks.save.mockRejectedValueOnce(new Error('Sin conexión'))
    const onSaved = vi.fn()
    const contract = {
      id: 'contract',
      tenant_id: 'tenant',
      starts_on: '2026-01-01',
      ends_on: '2026-12-31',
      renewal_mode: 'manual',
      notes: '',
    } as ServiceContract
    const form = ContractAgreementForm({ contract, onSaved })
    form.props.onSubmit({ preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>)
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalled())
    await vi.waitFor(() => expect(mocks.states[3]).toBe(false))
    expect(onSaved).not.toHaveBeenCalled()
  })
})
