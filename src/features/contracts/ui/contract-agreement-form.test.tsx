import type { FormEvent, ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { ServiceContract } from '../application/contract-actions'

const mocks = vi.hoisted(() => ({ save: vi.fn(), invalidate: vi.fn() }))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: (value: unknown) => [value, vi.fn()],
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
  TextField: ({ label }: { label: string }) => <span>{label}</span>,
  TextareaField: ({ label }: { label: string }) => <span>{label}</span>,
}))
vi.mock('../application/contract-actions', () => ({ updateDraftContractDetails: mocks.save }))

import { ContractAgreementForm } from './contract-agreement-form'

describe('contract summary form', () => {
  it.each(['pending', 'manual', 'automatic'] as const)(
    'hides renewal and preserves the existing %s value when saving',
    async (renewal) => {
      mocks.save.mockClear()
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
})
