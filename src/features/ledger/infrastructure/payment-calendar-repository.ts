import type { SupabaseClient } from '@supabase/supabase-js'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { CalendarInvoice, ScheduledPayment } from '../domain/payment-calendar'

/** Keyset pagination avoids the API row limit and keeps the calendar complete. */
async function loadRows(
  db: SupabaseClient,
  table: 'invoices' | 'scheduled_payments',
  tenantId: string,
  columns: string,
) {
  const rows: Record<string, unknown>[] = []
  let cursor = ''
  for (;;) {
    let query = db.from(table).select(columns).eq('tenant_id', tenantId).order('id').limit(500)
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const page = (data ?? []) as unknown as Record<string, unknown>[]
    rows.push(...page)
    if (page.length < 500) return rows
    const next = page.at(-1)?.id
    if (typeof next !== 'string') throw new Error('No se pudo completar la lectura del calendario')
    if (!next || next === cursor) throw new Error('No se pudo completar la lectura del calendario')
    cursor = next
  }
}

export async function loadPaymentCalendar(tenantId: string, db = createBrowserSupabaseClient()) {
  const [invoices, payments] = await Promise.all([
    loadRows(
      db,
      'invoices',
      tenantId,
      'id,number,concept,due_date,total_cents,paid_cents,document_snapshot',
    ),
    loadRows(
      db,
      'scheduled_payments',
      tenantId,
      'id,tenant_id,concept,supplier,category,amount_cents,vat_rate,due_date,status,paid_on,ledger_entry_id',
    ),
  ])
  return { invoices: invoices as CalendarInvoice[], payments: payments as ScheduledPayment[] }
}

export async function saveScheduledPayment(payment: ScheduledPayment) {
  const { error } = await createBrowserSupabaseClient().rpc('save_scheduled_payment', {
    p_id: payment.id,
    p_tenant_id: payment.tenant_id,
    p_concept: payment.concept,
    p_supplier: payment.supplier,
    p_category: payment.category,
    p_amount_cents: payment.amount_cents,
    p_vat_rate: payment.vat_rate,
    p_due_date: payment.due_date,
  })
  if (error) throw new Error(error.message)
}

export async function settleScheduledPayment(tenantId: string, id: string, date: string) {
  const { error } = await createBrowserSupabaseClient().rpc('settle_scheduled_payment', {
    p_tenant_id: tenantId,
    p_id: id,
    p_paid_on: date,
  })
  if (error) throw new Error(error.message)
}

export async function cancelScheduledPayment(tenantId: string, id: string) {
  const { error } = await createBrowserSupabaseClient().rpc('cancel_scheduled_payment', {
    p_tenant_id: tenantId,
    p_id: id,
  })
  if (error) throw new Error(error.message)
}
