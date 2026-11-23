import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Estimate } from '@/shared/domain/types'

type ButtonProps = { children: ReactNode; isDisabled?: boolean; onPress?: () => void }
const mocks = vi.hoisted(() => ({
  invoices: [] as Array<{ estimateId: string; milestoneId: string; number: string }>,
  buttons: [] as ButtonProps[],
  patch: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@doscientos/ui', () => ({
  Button: (props: ButtonProps) => {
    mocks.buttons.push(props)
    return <button disabled={props.isDisabled}>{props.children}</button>
  },
  Input: () => null,
  toast: { error: mocks.error },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/facturas">{children}</a>,
}))
vi.mock('@/features/auth', () => ({ useSession: () => ({ role: 'admin' }) }))
vi.mock('@/features/invoices/application/invoice-draft-actions', () => ({
  createMilestoneInvoiceDraft: vi.fn(),
}))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({ invoices: mocks.invoices }),
  newId: () => 'new-milestone',
}))
vi.mock('../application/estimate-actions', () => ({ registerMilestonePayment: vi.fn() }))
vi.mock('./estimate-draft-context', () => ({ usePatchEstimate: () => mocks.patch }))

import { MilestonesEditor } from './milestones-editor'

const estimate: Estimate = {
  id: 'estimate',
  tenantId: 'tenant',
  number: 'P-1',
  clientId: 'client',
  title: 'Servicio',
  status: 'draft',
  lines: [],
  milestones: [{ id: 'milestone', label: 'Señal', percent: 100 }],
  discountType: 'none',
  discountValue: 0,
  vatRate: 21,
  clauses: '',
  validUntil: '2026-12-01',
  createdAt: '2026-11-01',
}

function render() {
  return renderToStaticMarkup(
    <MilestonesEditor
      estimate={estimate}
      amounts={[{ id: 'milestone', label: 'Señal', percent: 100, amountCents: 12100 }]}
      percentSum={100}
      paidCents={0}
      totalCents={12100}
      ledger={[]}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buttons = []
  mocks.invoices = []
})

describe('payment splits', () => {
  it('sets a single 100% milestone using the existing milestone identity', () => {
    render()
    mocks.buttons.find((button) => button.children === 'Un pago · 100 %')?.onPress?.()
    expect(mocks.patch).toHaveBeenCalledWith('estimate', {
      milestones: [{ id: 'milestone', label: 'Señal', percent: 100 }],
    })
  })

  it('sets two 50% milestones and gives the new milestone its own identity', () => {
    render()
    mocks.buttons.find((button) => button.children === 'Dos pagos · 50 / 50')?.onPress?.()
    expect(mocks.patch).toHaveBeenCalledWith('estimate', {
      milestones: [
        { id: 'milestone', label: 'Señal', percent: 50 },
        { id: 'new-milestone', label: 'Pago 2', description: '', percent: 50 },
      ],
    })
  })

  it('prevents replacing an already invoiced payment plan', () => {
    mocks.invoices = [{ estimateId: 'estimate', milestoneId: 'milestone', number: 'F-1' }]
    render()
    expect(mocks.buttons.find((button) => button.children === 'Un pago · 100 %')?.isDisabled).toBe(
      true,
    )
    expect(
      mocks.buttons.find((button) => button.children === 'Dos pagos · 50 / 50')?.isDisabled,
    ).toBe(true)
  })
})

describe('milestone removal', () => {
  it('disables removing an invoiced milestone even when no payment is registered', () => {
    mocks.invoices = [{ estimateId: 'estimate', milestoneId: 'milestone', number: 'F-1' }]
    expect(render()).toContain('Facturado, pendiente de cobro')
    expect(mocks.buttons.find((button) => button.children === 'Quitar')?.isDisabled).toBe(true)
  })

  it('still permits removing an unbilled milestone', () => {
    render()
    const remove = mocks.buttons.find((button) => button.children === 'Quitar')
    expect(remove?.isDisabled).toBe(false)
    remove?.onPress?.()
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith('estimate', { milestones: [] })
  })

  it('shows a rejection without crashing when the invoice appears after rendering', () => {
    mocks.patch.mockImplementationOnce(() => {
      throw new Error('El hito tiene facturas emitidas')
    })
    render()
    mocks.buttons.find((button) => button.children === 'Quitar')?.onPress?.()
    expect(mocks.error).toHaveBeenCalledWith('No se pudo modificar el hito', {
      description: 'El hito tiene facturas emitidas',
    })
  })
})
