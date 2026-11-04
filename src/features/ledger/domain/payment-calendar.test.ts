import { describe, expect, it } from 'vitest'

import {
  calendarItems,
  calendarSummary,
  type CalendarInvoice,
  type ScheduledPayment,
} from './payment-calendar'

const invoice = (
  id: string,
  due_date: string,
  total_cents: number,
  paid_cents: number,
): CalendarInvoice => ({
  id,
  due_date,
  total_cents,
  paid_cents,
  number: id,
  concept: 'Servicio',
  document_snapshot: { client: { name: 'Cliente' } },
})
const payment = (
  id: string,
  due_date: string,
  status: ScheduledPayment['status'],
): ScheduledPayment => ({
  id,
  tenant_id: 'tenant',
  concept: 'Material',
  supplier: 'Proveedor',
  category: '',
  amount_cents: 3000,
  vat_rate: 21,
  due_date,
  status,
  paid_on: status === 'paid' ? due_date : null,
  ledger_entry_id: status === 'paid' ? 'entry' : null,
})

describe('payment calendar', () => {
  it('uses only the outstanding invoice balance and excludes paid invoices and cancelled forecasts', () => {
    const items = calendarItems(
      [invoice('partial', '2026-11-10', 10000, 2500), invoice('paid', '2026-11-10', 5000, 5000)],
      [
        payment('cancelled', '2026-11-10', 'cancelled'),
        payment('paid-expense', '2026-11-11', 'paid'),
      ],
    )
    expect(items.map((item) => item.id)).toEqual(['partial', 'paid-expense'])
    expect(items[0]).toMatchObject({ amount: 7500, party: 'Cliente' })
    expect(calendarSummary(items, '2026-11', '2026-11-20')).toMatchObject({
      income: 7500,
      expense: 0,
    })
  })

  it('summarizes the selected month separately from all overdue balances', () => {
    const items = calendarItems(
      [invoice('old', '2026-10-10', 1000, 0), invoice('today', '2026-11-04', 2000, 0)],
      [payment('late', '2026-11-03', 'pending'), payment('future', '2026-12-01', 'pending')],
    )
    const result = calendarSummary(items, '2026-11', '2026-11-04')
    expect(result.income).toBe(2000)
    expect(result.expense).toBe(3000)
    expect(result.overdue.map((item) => item.id)).toEqual(['old', 'late'])
  })
})
