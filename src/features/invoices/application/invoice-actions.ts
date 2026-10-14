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
      id: newId(),
      tenantId: data.tenant.id,
      number: formatInvoiceNumber(data.invoices.length + 1, now.getFullYear()),
      estimateId: estimate.id,
      milestoneId: milestone.id,
      clientId: estimate.clientId,
      concept: `${estimate.title} · ${milestone.label || 'Hito'}`,
      totalCents: milestone.amountCents,
      paidCents: 0,
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

export function invoiceOutstandingCents(invoice: Pick<Invoice, 'totalCents' | 'paidCents'>): number {
  return Math.max(0, invoice.totalCents - invoice.paidCents)
}

/**
 * Records a payment (total or partial) as income in the ledger and adds it to the invoice.
 * The amount is capped at what is still owed; the invoice becomes paid when nothing is left.
 */
export function registerInvoicePayment(id: string, amountCents: number, date = today()): void {
  updateTenantData((data) => {
    const invoice = data.invoices.find((i) => i.id === id)
    if (!invoice || invoice.status === 'paid') return data
    const amount = Math.min(Math.round(amountCents), invoiceOutstandingCents(invoice))
    if (amount <= 0) return data
    const paidCents = invoice.paidCents + amount
    const complete = paidCents >= invoice.totalCents
    const entry: LedgerEntry = {
      id: newId(),
      tenantId: data.tenant.id,
      kind: 'income',
      date,
      concept: `${invoice.number} · ${complete && amount === invoice.totalCents ? '' : complete ? 'último cobro · ' : 'cobro parcial · '}${invoice.concept}`,
      category: 'Cobro de presupuesto',
      amountCents: amount,
      vatRate: invoice.vatRate,
      estimateId: invoice.estimateId,
      milestoneId: invoice.milestoneId,
    }
    return {
      ...data,
      invoices: data.invoices.map((i) =>
        i.id === id ? { ...i, paidCents, status: complete ? 'paid' : i.status } : i,
      ),
      ledger: [entry, ...data.ledger],
    }
  })
}

/** Marks the invoice as fully paid: registers whatever is still owed. */
export function markInvoicePaid(id: string): void {
  // The amount is capped at what is owed, so asking for "everything" pays exactly the remainder.
  registerInvoicePayment(id, Number.MAX_SAFE_INTEGER)
}

export function deleteInvoice(id: string): void {
  updateTenantData((data) => ({ ...data, invoices: data.invoices.filter((i) => i.id !== id) }))
}
