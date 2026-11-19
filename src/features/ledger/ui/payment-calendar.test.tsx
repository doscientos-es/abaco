import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CalendarEvent, CalendarEventChange } from '@/shared/lib/event-calendar'

import type { ScheduledPayment } from '../domain/payment-calendar'
import { PaymentCalendar } from './payment-calendar'

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  setForm: vi.fn(),
  setSelected: vi.fn(),
  index: 0,
  calendar: null as null | {
    items: CalendarEvent[]
    onItemClick: (item: CalendarEvent) => void
    onItemChange: (change: CalendarEventChange) => void
  },
}))
vi.mock('react', async (load) => {
  const actual = await load<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const state = actual.useState(initial)
      const index = mocks.index++
      if (index === 1) return [state[0], mocks.setForm]
      if (index === 7) return [state[0], mocks.setSelected]
      return state
    },
  }
})
vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  ConfirmDialog: () => null,
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({
    data: {
      invoices: [
        {
          id: 'invoice',
          number: 'TEST',
          concept: 'Factura',
          due_date: '2026-11-13',
          total_cents: 10000,
          paid_cents: 0,
          document_snapshot: null,
        },
      ],
      payments: [payment, { ...payment, id: 'paid', status: 'paid' }],
    },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/facturas/test">{children}</a>,
}))
vi.mock('@/shared/store/store', () => ({
  newId: () => 'new',
  refreshStore: vi.fn(),
  useSaveStatus: () => ({ state: 'saved' }),
}))
vi.mock('@/shared/ui/form', () => ({ TextField: () => null }))
vi.mock('@/shared/ui/form-dialog', () => ({ FormDialog: () => null }))
vi.mock('@/shared/ui/calendar-toolbar', () => ({ CalendarToolbar: () => null }))
vi.mock('@/shared/ui/event-calendar', () => ({
  EventCalendar: (props: NonNullable<typeof mocks.calendar>) => {
    mocks.calendar = props
    return null
  },
}))
vi.mock('../application/payment-calendar-actions', () => ({
  loadPaymentCalendar: vi.fn(),
  saveScheduledPayment: mocks.save,
  settleScheduledPayment: vi.fn(),
  cancelScheduledPayment: vi.fn(),
}))

const payment: ScheduledPayment = {
  id: 'payment',
  tenant_id: 'tenant',
  concept: 'Material TEST',
  supplier: 'Proveedor',
  category: 'Material',
  amount_cents: 12100,
  vat_rate: 21,
  due_date: '2026-11-13',
  status: 'pending',
  paid_on: null,
  ledger_entry_id: null,
}
describe('payment calendar interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.index = 0
    mocks.calendar = null
  })
  it('edits a pending payment on click, but selects invoices and paid payments for viewing', () => {
    renderToStaticMarkup(<PaymentCalendar tenantId="tenant" defaultVatRate={21} />)
    const event = (id: string) => {
      const item = mocks.calendar?.items.find((item) => item.id === id)
      if (!item) throw new Error(`Missing event ${id}`)
      mocks.calendar?.onItemClick(item)
    }
    event('expense:payment')
    expect(mocks.setForm).toHaveBeenCalledWith(
      expect.objectContaining({ id: payment.id, dueDate: payment.due_date }),
    )
    event('expense:paid')
    expect(mocks.setSelected).toHaveBeenLastCalledWith('expense:paid')
    event('income:invoice')
    expect(mocks.setSelected).toHaveBeenLastCalledWith('income:invoice')
    expect(mocks.setForm).toHaveBeenCalledTimes(1)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('only moves pending payments, without inventing durations or altering invoices and paid expenses', () => {
    renderToStaticMarkup(<PaymentCalendar tenantId="tenant" defaultVatRate={21} />)
    expect(
      mocks.calendar?.items.map(({ id, editable, resizable }) => ({ id, editable, resizable })),
    ).toEqual(
      expect.arrayContaining([
        { id: 'income:invoice', editable: false, resizable: false },
        { id: 'expense:payment', editable: true, resizable: false },
        { id: 'expense:paid', editable: false, resizable: false },
      ]),
    )
  })
  it('opens the existing payment form with the proposed date and preserves the original financial data', () => {
    renderToStaticMarkup(<PaymentCalendar tenantId="tenant" defaultVatRate={21} />)
    const item = mocks.calendar?.items.find((item) => item.id === 'expense:payment')
    if (!item) throw new Error('Missing payment event')
    mocks.calendar?.onItemChange({
      item,
      start: new Date(2026, 10, 20),
      end: new Date(2026, 10, 21),
      kind: 'move',
    })
    expect(mocks.setForm).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'payment',
        dueDate: '2026-11-20',
        concept: payment.concept,
        supplier: payment.supplier,
        vatRate: '21',
      }),
    )
    expect(mocks.save).not.toHaveBeenCalled()
    expect(payment.due_date).toBe('2026-11-13')
  })
})
