import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { EmailSendError, sendEmail } from './resend.ts'
import {
  decryptReportToken,
  visitReportEmail,
  type ReportEmailContent,
} from './visit-report-email.ts'

type ClaimedDelivery = ReportEmailContent & {
  tenant_id: string
  report_version_id: string
  share_id: string
  token_hash: string
  token_ciphertext: string
  token_nonce: string
  lease_token: string
}

async function finish(
  admin: SupabaseClient,
  delivery: ClaimedDelivery,
  outcome: 'sent' | 'retry' | 'failed',
  messageId?: string,
  code?: string,
) {
  const { data, error } = await admin.rpc('finish_service_visit_report_email_delivery', {
    p_id: delivery.id,
    p_lease_token: delivery.lease_token,
    p_outcome: outcome,
    p_provider_message_id: messageId ?? null,
    p_error_code: code ?? null,
  })
  if (error || data !== true) throw new Error('No se pudo finalizar el intento de entrega')
}

/** Claim and process one queued delivery. Returns false when there is no due work. */
export async function dispatchVisitReportEmail(admin: SupabaseClient, deliveryId?: string) {
  const { data, error } = await admin.rpc('claim_service_visit_report_email_delivery', {
    p_id: deliveryId ?? null,
  })
  if (error) throw new Error('No se pudo reservar la entrega')
  const delivery = (data?.[0] ?? null) as ClaimedDelivery | null
  if (!delivery) return false

  const { data: share, error: shareError } = await admin
    .from('service_visit_report_shares')
    .select('id,tenant_id,report_version_id,token_hash,expires_at,revoked_at')
    .eq('id', delivery.share_id)
    .eq('tenant_id', delivery.tenant_id)
    .eq('report_version_id', delivery.report_version_id)
    .maybeSingle()
  if (shareError) throw new Error('No se pudo comprobar el enlace del parte')
  if (
    !share ||
    share.revoked_at ||
    share.token_hash !== delivery.token_hash ||
    new Date(share.expires_at).getTime() <= Date.now()
  ) {
    await finish(admin, delivery, 'failed', undefined, 'share_unavailable')
    return true
  }

  try {
    const secret = Deno.env.get('REPORT_DELIVERY_KEY')
    if (!secret) throw new Error('Falta REPORT_DELIVERY_KEY')
    const token = await decryptReportToken(
      delivery.token_ciphertext,
      delivery.token_nonce,
      delivery.id,
      secret,
    )
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
    if (hash !== delivery.token_hash) {
      await finish(admin, delivery, 'failed', undefined, 'token_mismatch')
      return true
    }
    const messageId = await sendEmail(visitReportEmail(delivery, token))
    await finish(admin, delivery, 'sent', messageId)
  } catch (error) {
    const retryable = !(error instanceof EmailSendError) || error.retryable
    const code =
      error instanceof EmailSendError
        ? `provider_${error.status}`
        : retryable
          ? 'network_failure'
          : 'delivery_failed'
    await finish(admin, delivery, retryable ? 'retry' : 'failed', undefined, code)
  }
  return true
}
