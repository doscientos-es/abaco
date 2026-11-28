import type { Invoice } from '@/shared/domain/types'

export type InvoiceCollection = 'todas' | 'pendientes' | 'vencidas'
type CollectibleInvoice = Pick<Invoice, 'totalCents' | 'paidCents' | 'status' | 'dueDate'>

export function invoiceOutstandingCents(
  invoice: Pick<Invoice, 'totalCents' | 'paidCents'>,
): number {
  return Math.max(0, invoice.totalCents - invoice.paidCents)
}

export function isCollectionPending(invoice: CollectibleInvoice): boolean {
  return invoice.status !== 'paid' && invoiceOutstandingCents(invoice) > 0
}

export function isCollectionOverdue(invoice: CollectibleInvoice, today: string): boolean {
  return isCollectionPending(invoice) && Boolean(invoice.dueDate) && invoice.dueDate < today
}

export function matchesInvoiceCollection(
  invoice: CollectibleInvoice,
  scope: InvoiceCollection,
  today: string,
): boolean {
  if (scope === 'todas') return true
  return scope === 'pendientes' ? isCollectionPending(invoice) : isCollectionOverdue(invoice, today)
}

export function compareInvoiceDueDate(a: CollectibleInvoice, b: CollectibleInvoice): number {
  return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31')
}
