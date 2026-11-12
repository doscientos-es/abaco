import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { fetchAllPages } from '@/shared/lib/supabase/fetch-all-pages'

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
  return fetchAllPages<T>((from, to) =>
    db
      .from(table)
      .select(columns)
      .eq('tenant_id', tenantId)
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to),
  )
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
