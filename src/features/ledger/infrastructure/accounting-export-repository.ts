import type { SupabaseClient } from '@supabase/supabase-js'

import type { ExportClient, ExportExpense, ExportInvoice, ExportPayment } from '@/shared/domain/csv'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

type ExportTable =
  | 'clients'
  | 'invoices'
  | 'invoice_payment_operations'
  | 'invoice_payment_refunds'
  | 'ledger_entries'
export type ExportDataset = 'clients' | 'invoices' | 'payments' | 'expenses' | 'all'
type DbRow = Record<string, unknown> & { id: string }

const string = (value: unknown): string => (typeof value === 'string' ? value : '')
const number = (value: unknown): number => Number(value ?? 0)

/** Keyset pagination avoids Supabase's per-request row cap and duplicate offset pages. */
async function fetchAll(
  db: SupabaseClient,
  table: ExportTable,
  tenantId: string,
  columns: string,
  expenseOnly = false,
): Promise<DbRow[]> {
  const rows: DbRow[] = []
  let afterId = ''
  for (;;) {
    let query = db
      .from(table)
      .select(columns)
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true })
      .limit(500)
    if (afterId) query = query.gt('id', afterId)
    if (expenseOnly) query = query.eq('kind', 'expense')
    const { data, error } = await query
    if (error) throw new Error(`${table}: ${error.message}`)
    const page = (data ?? []) as unknown as DbRow[]
    rows.push(...page)
    if (page.length < 500) return rows
    const nextId = page[page.length - 1]?.id
    if (!nextId || nextId === afterId) throw new Error(`${table}: paginación incompleta`)
    afterId = nextId
  }
}

export async function loadAccountingExport(
  tenantId: string,
  dataset: ExportDataset = 'all',
  db = createBrowserSupabaseClient(),
): Promise<{
  clients: ExportClient[]
  invoices: ExportInvoice[]
  payments: ExportPayment[]
  expenses: ExportExpense[]
}> {
  const [clientRows, invoiceRows, paymentRows, refundRows, expenseRows] = await Promise.all([
    dataset === 'all' || dataset === 'clients'
      ? fetchAll(
          db,
          'clients',
          tenantId,
          'id,name,kind,tax_id,email,phone,address,billing_address,archived_at,notes',
        )
      : [],
    dataset === 'all' || dataset === 'invoices' || dataset === 'payments'
      ? fetchAll(
          db,
          'invoices',
          tenantId,
          'id,number,issued_at,due_date,client_id,estimate_id,milestone_id,work_extra_id,contract_period_id,concept,total_cents,vat_rate,paid_cents,email_accepted_at,document_snapshot',
        )
      : [],
    dataset === 'all' || dataset === 'payments'
      ? fetchAll(
          db,
          'invoice_payment_operations',
          tenantId,
          'id,invoice_id,ledger_entry_id,payment_date,amount_cents,payment_method',
        )
      : [],
    dataset === 'all' || dataset === 'payments'
      ? fetchAll(
          db,
          'invoice_payment_refunds',
          tenantId,
          'id,invoice_id,ledger_entry_id,refund_date,amount_cents,reason',
        )
      : [],
    dataset === 'all' || dataset === 'expenses'
      ? fetchAll(
          db,
          'ledger_entries',
          tenantId,
          'id,entry_date,concept,category,amount_cents,vat_rate,estimate_id,milestone_id',
          true,
        )
      : [],
  ])

  return {
    clients: clientRows.map((row) => ({
      id: row.id,
      name: string(row.name),
      kind: string(row.kind),
      taxId: string(row.tax_id),
      email: string(row.email),
      phone: string(row.phone),
      address: string(row.address),
      billingAddress: string(row.billing_address),
      archivedAt: string(row.archived_at),
      notes: string(row.notes),
    })),
    invoices: invoiceRows.map((row) => {
      const snapshot = row.document_snapshot as Record<string, unknown> | null
      const issuer = snapshot?.issuer as Record<string, unknown> | undefined
      const client = snapshot?.client as Record<string, unknown> | undefined
      const workExtraId = string(row.work_extra_id)
      const contractPeriodId = string(row.contract_period_id)
      return {
        id: row.id,
        number: string(row.number),
        issuedAt: string(row.issued_at),
        dueDate: string(row.due_date),
        clientId: string(row.client_id),
        issuerTaxId: string(issuer?.taxId),
        clientTaxId: string(client?.taxId),
        sourceKind: contractPeriodId
          ? ('contract_period' as const)
          : workExtraId
            ? ('work_extra' as const)
            : ('milestone' as const),
        sourceId: contractPeriodId || workExtraId || string(row.milestone_id),
        concept: string(row.concept),
        totalCents: number(row.total_cents),
        vatRate: number(row.vat_rate),
        paidCents: number(row.paid_cents),
        emailAcceptedAt: string(row.email_accepted_at),
      }
    }),
    payments: [
      ...paymentRows.map((row) => ({
        id: row.id,
        invoiceId: string(row.invoice_id),
        ledgerEntryId: string(row.ledger_entry_id),
        date: string(row.payment_date),
        amountCents: number(row.amount_cents),
        type: 'payment' as const,
        method: string(row.payment_method),
      })),
      ...refundRows.map((row) => ({
        id: row.id,
        invoiceId: string(row.invoice_id),
        ledgerEntryId: string(row.ledger_entry_id),
        date: string(row.refund_date),
        amountCents: -number(row.amount_cents),
        type: 'refund' as const,
        reason: string(row.reason),
      })),
    ],
    expenses: expenseRows.map((row) => ({
      id: row.id,
      date: string(row.entry_date),
      concept: string(row.concept),
      category: string(row.category),
      amountCents: number(row.amount_cents),
      vatRate: number(row.vat_rate),
      estimateId: string(row.estimate_id),
      milestoneId: string(row.milestone_id),
    })),
  }
}
