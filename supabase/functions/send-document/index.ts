/**
 * Envía por email (Resend) una factura o un presupuesto al cliente. Lee el documento de la base de datos,
 * nunca del body: el navegador solo dice qué documento y la función decide destinatario y contenido.
 * Valida sesión y rol (owner/admin/editor) y conserva el evento de aceptación de Resend.
 *
 * Body: { kind: 'invoice' | 'estimate', id: uuid }
 * Respuesta: 200 { to } | 4xx/5xx { error: 'no_client_email' | 'forbidden' | 'not_found' | ... }
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

import { sendEmail } from '../_shared/resend.ts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const writers = ['owner', 'admin', 'editor']

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const euros = (cents: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100)

const colorPattern = /^#[0-9a-fA-F]{6}$/
const stringValue = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Plain text in, simple HTML out (paragraphs) with the company's color and logo. Everything is escaped. */
function toHtml(text: string, brand: { color: string; logoUrl: string; company: string }) {
  const logo = brand.logoUrl.startsWith('https://')
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.company)}" style="display:block;max-height:48px;max-width:180px;margin:0 0 16px">`
    : ''
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;border-top:4px solid ${brand.color};padding-top:16px">${logo}${text
    .split('\n')
    .map((line) => (line ? `<p style="margin:0 0 8px">${escapeHtml(line)}</p>` : '<br>'))
    .join('')}</div>`
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey || !serviceKey) return reply(500, { error: 'not_configured' })
  if (!authorization) return reply(401, { error: 'unauthorized' })

  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: caller } = await asCaller.auth.getUser()
  if (!caller.user) return reply(401, { error: 'unauthorized' })

  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const kind = input?.kind
  const id = typeof input?.id === 'string' ? input.id : ''
  if ((kind !== 'invoice' && kind !== 'estimate') || !uuidPattern.test(id))
    return reply(400, { error: 'invalid_input' })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // 1. El documento (service role) y, a partir de él, la empresa a la que pertenece.
  const table = kind === 'invoice' ? 'invoices' : 'estimates'
  const { data: doc } = await admin.from(table).select('*').eq('id', id).maybeSingle()
  if (!doc) return reply(404, { error: 'not_found' })

  // 2. Permiso sobre ESA empresa.
  const { data: mine } = await admin
    .from('memberships')
    .select('role')
    .eq('tenant_id', doc.tenant_id)
    .eq('user_id', caller.user.id)
    .maybeSingle()
  if (!mine || !writers.includes(mine.role)) return reply(403, { error: 'forbidden' })

  // 3. Cliente y empresa.
  const [{ data: client }, { data: tenant }] = await Promise.all([
    admin
      .from('clients')
      .select('name, email')
      .eq('id', doc.client_id)
      .eq('tenant_id', doc.tenant_id)
      .maybeSingle(),
    admin
      .from('tenants')
      .select(
        'name, email, brand_color, logo_url, email_from_name, email_signature, invoice_email_intro, estimate_email_intro',
      )
      .eq('id', doc.tenant_id)
      .maybeSingle(),
  ])
  const to = (client?.email ?? '').trim()
  if (!emailPattern.test(to)) return reply(422, { error: 'no_client_email' })

  let publication: Record<string, Record<string, unknown>> | null = null
  if (kind === 'estimate') {
    // Publication and its exact snapshot commit before any external email effect.
    if (doc.status === 'draft') {
      const { error: publishError } = await admin
        .from('estimates')
        .update({ status: 'sent' })
        .eq('id', id)
        .eq('status', 'draft')
      if (publishError) return reply(500, { error: 'publication_failed' })
    }
    const { data: version, error: versionError } = await admin
      .from('estimate_publications')
      .select('snapshot')
      .eq('estimate_id', id)
      .eq('tenant_id', doc.tenant_id)
      .maybeSingle()
    if (versionError || !version?.snapshot) return reply(500, { error: 'publication_missing' })
    publication = version.snapshot as Record<string, Record<string, unknown>>
  }
  const publishedEstimate = publication?.estimate
  const publishedTenant = publication?.tenant
  const publishedClient = publication?.client
  const company = kind === 'estimate' ? stringValue(publishedTenant?.name) : (tenant?.name ?? '')
  const signature = (tenant?.email_signature ?? '').trim() || company
  const customIntro = (
    (kind === 'invoice' ? tenant?.invoice_email_intro : tenant?.estimate_email_intro) ?? ''
  ).trim()
  const rawColor =
    kind === 'estimate' ? stringValue(publishedTenant?.brand_color) : (tenant?.brand_color ?? '')
  const brandColor = colorPattern.test(rawColor) ? rawColor : '#2a4227'

  // 4. Contenido.
  let subject: string
  let text: string
  if (kind === 'invoice') {
    subject = `Factura ${doc.number} · ${company}`
    text = [
      `Hola ${client?.name ?? ''},`,
      '',
      ...(customIntro ? [customIntro, ''] : []),
      `Te enviamos la factura ${doc.number} por «${doc.concept}».`,
      `Importe: ${euros(Number(doc.total_cents))} (IVA incluido). Vencimiento: ${doc.due_date}.`,
      '',
      'Gracias por confiar en nosotros.',
      signature,
    ].join('\n')
  } else {
    if (!publishedEstimate || !publishedTenant || !publishedClient)
      return reply(500, { error: 'publication_invalid' })
    const lines = publishedEstimate.estimate_lines as Array<Record<string, unknown>>
    if (!Array.isArray(lines)) return reply(500, { error: 'publication_invalid' })
    // Misma lógica que calculateTotals: descuento por línea y luego el global.
    const net = lines.reduce((sum, l) => {
      const gross = Math.round(Number(l.quantity) * Number(l.unit_price_cents))
      const pct = Math.min(100, Math.max(0, Number(l.discount_percent) || 0))
      return sum + gross - Math.round((gross * pct) / 100)
    }, 0)
    const discountValue = Number(publishedEstimate.discount_value) || 0
    const globalDiscount =
      publishedEstimate.discount_type === 'percent'
        ? Math.round((net * Math.min(100, Math.max(0, discountValue))) / 100)
        : publishedEstimate.discount_type === 'amount'
          ? Math.min(net, Math.max(0, Math.round(discountValue)))
          : 0
    const subtotal = net - globalDiscount
    const total = subtotal + Math.round((subtotal * Number(publishedEstimate.vat_rate)) / 100)
    subject = `Presupuesto ${String(publishedEstimate.number)} · ${company}`
    const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '')
    const publicLink = appUrl && doc.public_token ? `${appUrl}/p/${doc.public_token}` : ''
    text = [
      `Hola ${stringValue(publishedClient.name)},`,
      '',
      ...(customIntro ? [customIntro, ''] : []),
      `Te enviamos el presupuesto ${String(publishedEstimate.number)} para «${String(publishedEstimate.title)}».`,
      `Total: ${euros(total)} (IVA incluido). Válido hasta ${String(publishedEstimate.valid_until)}.`,
      ...(publicLink ? ['', `Puedes verlo y aceptarlo aquí: ${publicLink}`] : []),
      '',
      'Quedamos a tu disposición para cualquier duda.',
      signature,
    ].join('\n')
  }

  // 5. Enviar. Una aceptación del proveedor es un evento de entrega separado de la emisión.
  let providerEmailId = ''
  try {
    providerEmailId = await sendEmail({
      to,
      subject,
      text,
      html: toHtml(text, {
        color: brandColor,
        logoUrl:
          kind === 'estimate' ? stringValue(publishedTenant?.logo_url) : (tenant?.logo_url ?? ''),
        company,
      }),
      fromName: (tenant?.email_from_name ?? '').trim() || company,
      replyTo: emailPattern.test(tenant?.email ?? '') ? tenant?.email : undefined,
      ...(kind === 'invoice' ? { tags: [{ name: 'category', value: 'invoice' }] } : {}),
    })
  } catch (error) {
    // eslint-disable-next-line no-console -- único rastro del fallo de Resend en los logs de la función
    console.error(
      'send-document: fallo de Resend',
      error instanceof Error ? error.message : 'desconocido',
    )
    return reply(502, { error: 'send_failed' })
  }

  if (kind === 'invoice') {
    const { error: markError } = await admin.from('invoice_delivery_events').insert({
      tenant_id: doc.tenant_id,
      invoice_id: id,
      event_type: 'accepted',
      recipient_email: to,
      resend_email_id: providerEmailId || null,
    })
    if (markError) {
      // eslint-disable-next-line no-console -- the provider accepted the email; do not provoke an automatic resend
      console.error('send-document: factura enviada, evento pendiente', markError.message)
    }
  } else {
    const { error: markError } = await admin
      .from('estimates')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', doc.tenant_id)
    if (markError) {
      // eslint-disable-next-line no-console -- delivery succeeded; a missing marker is safer than a blind resend
      console.error('send-document: correo entregado, marcador pendiente', markError.message)
    }
  }

  return reply(200, { to })
})
