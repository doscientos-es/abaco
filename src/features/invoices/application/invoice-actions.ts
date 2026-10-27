import type { Invoice } from '@/shared/domain/types'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { currentTenantData, newId, refreshStore } from '@/shared/store/store'

const today = () => new Date().toISOString().slice(0, 10)

export function invoiceOutstandingCents(
  invoice: Pick<Invoice, 'totalCents' | 'paidCents'>,
): number {
  return Math.max(0, invoice.totalCents - invoice.paidCents)
}

export type PaymentResult = { ok: true } | { ok: false; error: string }
export type PaymentMethod = 'transfer' | 'cash' | 'card' | 'other'
const fallbackOperationIds = new Map<string, string>()

/** A retry after a timeout reuses the same operation id, even across page reloads in this tab. */
function paymentOperationId(key: string): string {
  try {
    const stored = sessionStorage.getItem(key)
    if (stored) return stored
    const id = newId()
    sessionStorage.setItem(key, id)
    return id
  } catch {
    const existing = fallbackOperationIds.get(key)
    if (existing) return existing
    const id = newId()
    fallbackOperationIds.set(key, id)
    return id
  }
}

/** The database locks the invoice and records balance, ledger and operation in one transaction. */
export async function registerInvoicePayment(
  id: string,
  amountCents: number,
  method: PaymentMethod,
  date = today(),
): Promise<PaymentResult> {
  const tenantId = currentTenantData()?.tenant.id
  if (
    !tenantId ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return { ok: false, error: 'Comprueba el importe y la fecha del cobro.' }
  }
  const key = `abaco:invoice-payment:${tenantId}:${id}:${amountCents}:${date}:${method}`
  const operationId = paymentOperationId(key)
  try {
    const { error } = await createBrowserSupabaseClient().rpc('record_invoice_payment', {
      p_invoice_id: id,
      p_amount_cents: amountCents,
      p_payment_date: date,
      p_operation_id: operationId,
      p_payment_method: method,
    })
    if (error) return { ok: false, error: error.message }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo conectar.' }
  }
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* Storage may be unavailable. */
  }
  fallbackOperationIds.delete(key)
  await refreshStore()
  return { ok: true }
}

/** A refund reduces collected cash while leaving the issued document intact. */
export async function refundInvoicePayment(
  paymentId: string,
  amountCents: number,
  date: string,
  reason: string,
): Promise<PaymentResult> {
  const tenantId = currentTenantData()?.tenant.id
  const trimmedReason = reason.trim()
  if (
    !tenantId ||
    !paymentId ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !trimmedReason ||
    trimmedReason.length > 500
  ) {
    return { ok: false, error: 'Comprueba el importe, la fecha y el motivo del reembolso.' }
  }
  const key = `abaco:invoice-refund:${tenantId}:${paymentId}:${amountCents}:${date}:${trimmedReason}`
  const operationId = paymentOperationId(key)
  try {
    const { error } = await createBrowserSupabaseClient().rpc('refund_invoice_payment', {
      p_payment_id: paymentId,
      p_amount_cents: amountCents,
      p_refund_date: date,
      p_reason: trimmedReason,
      p_operation_id: operationId,
    })
    if (error) return { ok: false, error: error.message }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo conectar.' }
  }
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* Storage may be unavailable. */
  }
  fallbackOperationIds.delete(key)
  await refreshStore()
  return { ok: true }
}
