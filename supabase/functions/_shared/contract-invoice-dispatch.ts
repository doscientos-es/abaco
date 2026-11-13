import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { contractInvoiceEmail, type ContractInvoiceEmailPayload } from './contract-invoice-email.ts'
import { EmailSendError, sendEmail } from './resend.ts'

type Delivery = {
  invoice_id: string
  lease_token: string
  sender_address: string
  payload: ContractInvoiceEmailPayload
}

/** One lease, one stable message and one provider idempotency key, even after a lost DB response. */
export async function dispatchContractInvoiceEmail(admin: SupabaseClient, senderAddress: string) {
  const { data, error } = await admin.rpc('claim_contract_invoice_delivery', {
    p_sender_address: senderAddress,
  })
  if (error) throw new Error('claim_failed')
  const claimed = (data?.[0] ?? null) as Delivery | null
  if (!claimed) return false
  const delivery: Delivery = claimed

  let message: ReturnType<typeof contractInvoiceEmail>
  try {
    message = contractInvoiceEmail(delivery.payload)
  } catch {
    await finish('failed', null, 'invoice_invalid')
    return true
  }
  let outcome: 'sent' | 'retry' | 'failed' = 'sent'
  let providerId: string | null = null
  let code: string | null = null
  try {
    providerId = await sendEmail({
      ...message,
      fromAddress: delivery.sender_address,
      idempotencyKey: `contract-invoice/${delivery.invoice_id}`,
    })
  } catch (sendError) {
    outcome = sendError instanceof EmailSendError && !sendError.retryable ? 'failed' : 'retry'
    code = sendError instanceof EmailSendError ? `provider_${sendError.status}` : 'network_failure'
  }
  // Persistence failures must not be reclassified as mail failures after provider acceptance.
  await finish(outcome, providerId, code)
  return true

  async function finish(
    result: 'sent' | 'retry' | 'failed',
    id: string | null,
    failure: string | null,
  ) {
    const finished = await admin.rpc('finish_contract_invoice_delivery', {
      p_invoice_id: delivery.invoice_id,
      p_lease_token: delivery.lease_token,
      p_outcome: result,
      p_provider_email_id: id,
      p_error_code: failure,
    })
    if (finished.error || finished.data !== true) throw new Error('finish_failed')
  }
}
