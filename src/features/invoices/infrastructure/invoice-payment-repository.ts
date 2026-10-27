import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type InvoicePaymentRecord = {
  id: string
  payment_date: string
  amount_cents: number
  payment_method: 'unspecified' | 'transfer' | 'cash' | 'card' | 'other'
}

export type InvoiceRefundRecord = {
  id: string
  payment_id: string
  amount_cents: number
  refund_date: string
  reason: string
}

async function loadAll<T>(
  table: 'invoice_payment_operations' | 'invoice_payment_refunds',
  tenantId: string,
  invoiceId: string,
  columns: string,
): Promise<T[]> {
  const db = createBrowserSupabaseClient()
  const rows: T[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .eq('tenant_id', tenantId)
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + 499)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < 500) return rows
  }
}

export async function loadInvoicePaymentHistory(tenantId: string, invoiceId: string) {
  const [payments, refunds] = await Promise.all([
    loadAll<InvoicePaymentRecord>(
      'invoice_payment_operations',
      tenantId,
      invoiceId,
      'id,payment_date,amount_cents,payment_method',
    ),
    loadAll<InvoiceRefundRecord>(
      'invoice_payment_refunds',
      tenantId,
      invoiceId,
      'id,payment_id,amount_cents,refund_date,reason',
    ),
  ])
  return { payments, refunds }
}
