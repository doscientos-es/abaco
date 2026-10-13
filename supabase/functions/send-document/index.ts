/**
 * Envía por email (Resend) una factura o un presupuesto al cliente. Lee el documento de la base de datos,
 * nunca del body: el navegador solo dice qué documento y la función decide destinatario y contenido.
 * Valida sesión y rol (owner/admin/editor) y, si Resend confirma, marca el documento como enviado.
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
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const euros = (cents: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100)

/** Plain text in, simple HTML out (paragraphs). Everything is escaped. */
function toHtml(text: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">${text
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

  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: caller } = await asCaller.auth.getUser()
  if (!caller.user) return reply(401, { error: 'unauthorized' })

  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const kind = input?.kind
  const id = typeof input?.id === 'string' ? input.id : ''
  if ((kind !== 'invoice' && kind !== 'estimate') || !uuidPattern.test(id)) return reply(400, { error: 'invalid_input' })

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
    admin.from('clients').select('name, email').eq('id', doc.client_id).eq('tenant_id', doc.tenant_id).maybeSingle(),
    admin.from('tenants').select('name, email').eq('id', doc.tenant_id).maybeSingle(),
  ])
  const to = (client?.email ?? '').trim()
  if (!emailPattern.test(to)) return reply(422, { error: 'no_client_email' })
  const company = tenant?.name ?? ''

  // 4. Contenido.
  let subject: string
  let text: string
  if (kind === 'invoice') {
    subject = `Factura ${doc.number} · ${company}`
    text = [
      `Hola ${client?.name ?? ''},`,
      '',
      `Te enviamos la factura ${doc.number} por «${doc.concept}».`,
      `Importe: ${euros(Number(doc.total_cents))} (IVA incluido). Vencimiento: ${doc.due_date}.`,
      '',
      'Gracias por confiar en nosotros.',
      company,
    ].join('\n')
  } else {
    const { data: lines } = await admin
      .from('estimate_lines')
      .select('quantity, unit_price_cents')
      .eq('estimate_id', id)
      .eq('tenant_id', doc.tenant_id)
    const subtotal = (lines ?? []).reduce((sum, l) => sum + Math.round(Number(l.quantity) * Number(l.unit_price_cents)), 0)
    const total = subtotal + Math.round((subtotal * Number(doc.vat_rate)) / 100)
    subject = `Presupuesto ${doc.number} · ${company}`
    text = [
      `Hola ${client?.name ?? ''},`,
      '',
      `Te enviamos el presupuesto ${doc.number} para «${doc.title}».`,
      `Total: ${euros(total)} (IVA incluido). Válido hasta ${doc.valid_until}.`,
      '',
      'Quedamos a tu disposición para cualquier duda.',
      company,
    ].join('\n')
  }

  // 5. Enviar. Solo si Resend confirma se cambia el estado.
  try {
    await sendEmail({
      to,
      subject,
      text,
      html: toHtml(text),
      replyTo: emailPattern.test(tenant?.email ?? '') ? tenant?.email : undefined,
    })
  } catch (error) {
    console.error('send-document: fallo de Resend', error instanceof Error ? error.message : 'desconocido')
    return reply(502, { error: 'send_failed' })
  }

  const fromStatus = kind === 'invoice' ? 'issued' : 'draft'
  await admin.from(table).update({ status: 'sent' }).eq('id', id).eq('status', fromStatus)

  return reply(200, { to })
})
