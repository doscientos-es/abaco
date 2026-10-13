import type { MilestoneAmount } from '@/shared/domain/estimate'
import type { Estimate, Invoice, InvoiceStatus, LedgerEntry } from '@/shared/domain/types'
import { newId, updateTenantData } from '@/shared/store/store'

const today = () => new Date().toISOString().slice(0, 10)

export function formatInvoiceNumber(sequence: number, year: number): string {
  return `F-${year}-${String(sequence).padStart(3, '0')}`
}

/** Creates the invoice for one milestone. Does nothing if that milestone is already invoiced. */
export function generateInvoice(estimate: Estimate, milestone: MilestoneAmount): void {
  updateTenantData((data) => {
    if (data.invoices.some((i) => i.estimateId === estimate.id && i.milestoneId === milestone.id)) return data
    const now = new Date()
    const due = new Date(now.getTime() + 15 * 86_400_000).toISOString().slice(0, 10)
    const invoice: Invoice = {
      id: newId('inv'),
      tenantId: data.tenant.id,
      number: formatInvoiceNumber(data.invoices.length + 1, now.getFullYear()),
      estimateId: estimate.id,
      milestoneId: milestone.id,
      clientId: estimate.clientId,
      concept: `${estimate.title} · ${milestone.label || 'Hito'}`,
      totalCents: milestone.amountCents,
      vatRate: estimate.vatRate,
      status: 'issued',
      issuedAt: today(),
      dueDate: due,
    }
    return { ...data, invoices: [invoice, ...data.invoices] }
  })
}

export function setInvoiceStatus(id: string, status: InvoiceStatus): void {
  updateTenantData((data) => ({
    ...data,
    invoices: data.invoices.map((i) => (i.id === id ? { ...i, status } : i)),
  }))
}

/** Marks the invoice as paid and records the income in the ledger (once). */
export function markInvoicePaid(id: string): void {
  updateTenantData((data) => {
    const invoice = data.invoices.find((i) => i.id === id)
    if (!invoice || invoice.status === 'paid') return data
    const alreadyRecorded = data.ledger.some(
      (l) => l.estimateId === invoice.estimateId && l.milestoneId === invoice.milestoneId,
    )
    const entry: LedgerEntry = {
      id: newId('led'),
      tenantId: data.tenant.id,
      kind: 'income',
      date: today(),
      concept: `${invoice.number} · ${invoice.concept}`,
      category: 'Cobro de presupuesto',
      amountCents: invoice.totalCents,
      vatRate: invoice.vatRate,
      estimateId: invoice.estimateId,
      milestoneId: invoice.milestoneId,
    }
    return {
      ...data,
      invoices: data.invoices.map((i) => (i.id === id ? { ...i, status: 'paid' } : i)),
      ledger: alreadyRecorded ? data.ledger : [entry, ...data.ledger],
    }
  })
}

export function deleteInvoice(id: string): void {
  updateTenantData((data) => ({ ...data, invoices: data.invoices.filter((i) => i.id !== id) }))
}
