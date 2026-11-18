import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

type BackofficeReply = { status?: string; invoiceNumber?: string; portalUrl?: string }

export function hasInvoiceIntegration(): boolean {
  return Boolean(
    Deno.env.get('ABACO_BACKOFFICE_BILLING_URL') &&
    (Deno.env.get('ABACO_BILLING_SECRET')?.length ?? 0) >= 32,
  )
}

export async function requestBackoffice(body: Record<string, unknown>): Promise<BackofficeReply> {
  const endpoint = Deno.env.get('ABACO_BACKOFFICE_BILLING_URL')
  const secret = Deno.env.get('ABACO_BILLING_SECRET')
  if (!endpoint || !secret || secret.length < 32) return {}
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' || url.username || url.password) return {}
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    })
    if (!response.ok) return {}
    const data = await response.json()
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

export async function prepareCharge(client: SupabaseClient, tenantId: string) {
  const { data: profile, error } = await client
    .from('subscription_billing_profiles')
    .select('legal_name, tax_id, street, postal_code, city, province, email')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) return { message: 'No se pudieron consultar los datos de facturación.' }
  if (!profile) return { message: 'Guarda los datos fiscales de tu suscripción antes de pagar.' }

  const { status } = await requestBackoffice({ action: 'prepare', tenantId, recipient: profile })
  if (status === 'ready') return { profile }
  if (status === 'fiscal_identity_invalid') {
    return {
      message: 'La AEAT no ha validado el NIF y la razón social. Revisa los datos fiscales.',
    }
  }
  if (status === 'ambiguous_client' || status === 'recipient_mismatch') {
    return {
      message: 'Tus datos no coinciden con la ficha fiscal de Doscientos. Contacta con soporte.',
    }
  }
  return { message: 'La validación fiscal no está disponible. No se ha iniciado ningún cobro.' }
}

export function handoffResult(reply: BackofficeReply) {
  const { status, invoiceNumber, portalUrl } = reply
  if (status === 'fiscal_pending' || status === 'fiscal_review' || status === 'invoice_review') {
    return { status, number: null, url: null }
  }
  if (
    (status === 'sent' || status === 'email_pending' || status === 'email_review') &&
    typeof invoiceNumber === 'string' &&
    invoiceNumber.length > 0 &&
    typeof portalUrl === 'string' &&
    portalUrl.startsWith('https://')
  ) {
    return { status, number: invoiceNumber, url: portalUrl }
  }
  return { status: 'retrying', number: null, url: null }
}
