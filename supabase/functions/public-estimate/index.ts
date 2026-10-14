/**
 * Página pública del presupuesto: el cliente ve el presupuesto y lo acepta o rechaza sin tener cuenta.
 * La única credencial es el token del enlace (uuid aleatorio). Solo se exponen los datos que ya salen
 * en el documento del cliente; nunca el IBAN ni datos internos.
 *
 * Body: { token: uuid, action: 'view' | 'accept' | 'reject', name?: string }
 * Respuesta: 200 { estimate, tenant, client } | 4xx { error: 'not_found' | 'expired' | 'already_responded' | ... }
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

import { sendEmail } from '../_shared/resend.ts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const tenantColumns =
  'id, name, legal_name, tax_id, email, phone, address, postal_code, city, website, brand_color, logo_url, document_footer'

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

async function notifyViewed(
  estimate: Record<string, unknown>,
  tenant: Record<string, unknown> | null,
  client: Record<string, unknown> | null,
) {
  const to = typeof tenant?.email === 'string' ? tenant.email : ''
  if (!to) return
  const who = String(client?.name ?? 'Tu cliente')
  const title = `${String(estimate.number)} · ${String(estimate.title)}`
  const appUrl = Deno.env.get('APP_URL')
  const link = appUrl ? `${appUrl.replace(/\/$/, '')}/presupuestos/${String(estimate.id)}` : ''
  const text = `${who} acaba de abrir el presupuesto ${title}. Es un buen momento para llamarle.${link ? `\n\n${link}` : ''}`
  const html = `<p>${escapeHtml(who)} <strong>acaba de abrir</strong> el presupuesto ${escapeHtml(title)}. Es un buen momento para llamarle.</p>${
    link ? `<p><a href="${escapeHtml(link)}">Abrir presupuesto</a></p>` : ''
  }`
  await sendEmail({ to, subject: `Han abierto tu presupuesto: ${title}`, html, text, fromName: 'Ábaco' })
}

async function notifyOwner(
  estimate: Record<string, unknown>,
  tenant: Record<string, unknown> | null,
  client: Record<string, unknown> | null,
  accepted: boolean,
) {
  const to = typeof tenant?.email === 'string' ? tenant.email : ''
  if (!to) return
  const who = String(estimate.responded_by ?? '') || String(client?.name ?? 'Tu cliente')
  const verb = accepted ? 'ha aceptado' : 'ha rechazado'
  const title = `${String(estimate.number)} · ${String(estimate.title)}`
  const appUrl = Deno.env.get('APP_URL')
  const link = appUrl ? `${appUrl.replace(/\/$/, '')}/presupuestos/${String(estimate.id)}` : ''
  const note = accepted ? ' Ábaco creará la factura de la señal la próxima vez que abras la app.' : ''
  const text = `${who} ${verb} el presupuesto ${title}.${note}${link ? `\n\n${link}` : ''}`
  const html = `<p>${escapeHtml(who)} <strong>${verb}</strong> el presupuesto ${escapeHtml(title)}.${escapeHtml(note)}</p>${
    link ? `<p><a href="${escapeHtml(link)}">Abrir presupuesto</a></p>` : ''
  }`
  await sendEmail({
    to,
    subject: `${accepted ? 'Aceptado' : 'Rechazado'}: ${title}`,
    html,
    text,
    fromName: 'Ábaco',
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return reply(500, { error: 'not_configured' })

  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const token = typeof input?.token === 'string' ? input.token : ''
  const action = input?.action
  if (!uuidPattern.test(token) || (action !== 'view' && action !== 'accept' && action !== 'reject')) {
    return reply(400, { error: 'invalid_input' })
  }
  const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 120) : ''

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: estimate } = await admin
    .from('estimates')
    .select('*, estimate_lines(*), estimate_milestones(*)')
    .eq('public_token', token)
    .maybeSingle()
  // Un borrador no es público: se responde igual que si el enlace no existiera.
  if (!estimate || estimate.status === 'draft') return reply(404, { error: 'not_found' })

  if (action !== 'view') {
    if (estimate.status !== 'sent') return reply(409, { error: 'already_responded', status: estimate.status })
    if (String(estimate.valid_until) < new Date().toISOString().slice(0, 10)) return reply(409, { error: 'expired' })
    if (action === 'accept' && name.length < 2) return reply(422, { error: 'name_required' })

    const { data: updated } = await admin
      .from('estimates')
      .update({
        status: action === 'accept' ? 'accepted' : 'rejected',
        responded_at: new Date().toISOString(),
        responded_by: name || null,
      })
      .eq('id', estimate.id)
      .eq('status', 'sent')
      .select('id')
    // Si dos personas responden a la vez, solo gana la primera.
    if (!updated?.length) return reply(409, { error: 'already_responded' })
    estimate.status = action === 'accept' ? 'accepted' : 'rejected'
    estimate.responded_at = new Date().toISOString()
    estimate.responded_by = name || null
  }

  const [{ data: tenant }, { data: client }] = await Promise.all([
    admin.from('tenants').select(tenantColumns).eq('id', estimate.tenant_id).maybeSingle(),
    admin
      .from('clients')
      .select('id, tenant_id, name, address')
      .eq('id', estimate.client_id)
      .eq('tenant_id', estimate.tenant_id)
      .maybeSingle(),
  ])

  if (action === 'view' && estimate.status === 'sent' && !estimate.viewed_at) {
    // Primera apertura: se marca y se avisa al dueño una sola vez (el update solo gana si sigue sin abrir).
    const { data: marked } = await admin
      .from('estimates')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', estimate.id)
      .is('viewed_at', null)
      .select('id')
    if (marked?.length) {
      await notifyViewed(estimate, tenant, client).catch((error) => {
        // eslint-disable-next-line no-console -- único rastro del fallo del aviso en los logs de la función
        console.error('public-estimate: no se pudo avisar de la apertura', error instanceof Error ? error.message : 'desconocido')
      })
    }
  }

  if (action !== 'view') {
    // Aviso al dueño. Si falla el correo, la respuesta del cliente ya está guardada y no se le molesta.
    await notifyOwner(estimate, tenant, client, action === 'accept').catch((error) => {
      // eslint-disable-next-line no-console -- único rastro del fallo del aviso en los logs de la función
      console.error('public-estimate: no se pudo avisar', error instanceof Error ? error.message : 'desconocido')
    })
  }

  // El token y los ids internos no hacen falta en la página.
  const { public_token: _token, ...publicEstimate } = estimate
  return reply(200, { estimate: publicEstimate, tenant, client })
})
