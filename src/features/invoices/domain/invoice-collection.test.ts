import { describe, expect, it } from 'vitest'

import { todayInMadrid } from '@/shared/lib/date-range'

import {
  compareInvoiceDueDate,
  invoiceOutstandingCents,
  matchesInvoiceCollection,
} from './invoice-collection'

const today = '2026-11-29'
const unpaid = {
  status: 'sent',
  totalCents: 10000,
  paidCents: 2500,
  dueDate: '2026-11-28',
} as const

describe('seguimiento de cobros', () => {
  it('presenta el saldo real y no lista como pendiente una factura saldada', () => {
    expect(invoiceOutstandingCents(unpaid)).toBe(7500)
    expect(matchesInvoiceCollection(unpaid, 'pendientes', today)).toBe(true)
    expect(matchesInvoiceCollection({ ...unpaid, status: 'paid' }, 'vencidas', today)).toBe(false)
    expect(matchesInvoiceCollection({ ...unpaid, paidCents: 10000 }, 'pendientes', today)).toBe(
      false,
    )
  })

  it('usa el día de negocio y no marca como vencida una factura que vence hoy', () => {
    expect(todayInMadrid(new Date('2026-11-28T23:30:00Z'))).toBe(today)
    expect(matchesInvoiceCollection(unpaid, 'vencidas', today)).toBe(true)
    expect(matchesInvoiceCollection({ ...unpaid, dueDate: today }, 'vencidas', today)).toBe(false)
    expect(matchesInvoiceCollection({ ...unpaid, dueDate: '' }, 'vencidas', today)).toBe(false)
  })

  it('ordena el trabajo de cobro por fecha y deja las fechas ausentes al final', () => {
    const queue = [{ ...unpaid, dueDate: '' }, { ...unpaid, dueDate: today }, unpaid]
    expect(queue.sort(compareInvoiceDueDate).map((i) => i.dueDate)).toEqual([
      unpaid.dueDate,
      today,
      '',
    ])
  })
})
