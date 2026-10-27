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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const tenantColumns =
  'id, name, legal_name, tax_id, email, phone, address, postal_code, city, website, brand_color, logo_url, document_footer'
const estimateColumns = `id, tenant_id, number, client_id, title, status, valid_until,
  responded_at, responded_by, viewed_at`

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
const stringValue = (value: unknown): string => (typeof value === 'string' ? value : '')

async function notifyViewed(
  estimate: Record<string, unknown>,
  tenant: Record<string, unknown> | null,
  client: Record<string, unknown> | null,
) {
  const to = typeof tenant?.email === 'string' ? tenant.email : ''
  if (!to) return
  const who = stringValue(client?.name) || 'Tu cliente'
  const title = `${String(estimate.number)} · ${String(estimate.title)}`
  const appUrl = Deno.env.get('APP_URL')
  const link = appUrl ? `${appUrl.replace(/\/$/, '')}/presupuestos/${String(estimate.id)}` : ''
  const text = `${who} acaba de abrir el presupuesto ${title}. Es un buen momento para llamarle.${link ? `\n\n${link}` : ''}`
  const html = `<p>${escapeHtml(who)} <strong>acaba de abrir</strong> el presupuesto ${escapeHtml(title)}. Es un buen momento para llamarle.</p>${
    link ? `<p><a href="${escapeHtml(link)}">Abrir presupuesto</a></p>` : ''
  }`
  await sendEmail({
    to,
    subject: `Han abierto tu presupuesto: ${title}`,
    html,
    text,
    fromName: 'Ábaco',
  })
}

async function notifyOwner(
  estimate: Record<string, unknown>,
  tenant: Record<string, unknown> | null,
  client: Record<string, unknown> | null,
  accepted: boolean,
) {
  const to = typeof tenant?.email === 'string' ? tenant.email : ''
  if (!to) return
  const who = stringValue(estimate.responded_by) || stringValue(client?.name) || 'Tu cliente'
  const verb = accepted ? 'ha aceptado' : 'ha rechazado'
  const title = `${String(estimate.number)} · ${String(estimate.title)}`
  const appUrl = Deno.env.get('APP_URL')
  const link = appUrl ? `${appUrl.replace(/\/$/, '')}/presupuestos/${String(estimate.id)}` : ''
  const note = accepted ? ' La aceptación ya está disponible en Ábaco.' : ''
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
  if (
    !uuidPattern.test(token) ||
    (action !== 'view' && action !== 'accept' && action !== 'reject')
  ) {
    return reply(400, { error: 'invalid_input' })
  }
  const name = typeof input?.name === 'string' ? input.name.trim() : ''

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: estimate, error: estimateError } = await admin
    .from('estimates')
    .select(estimateColumns)
    .eq('public_token', token)
    .maybeSingle()
  if (estimateError) return reply(500, { error: 'lookup_failed' })
  // Un borrador no es público: se responde igual que si el enlace no existiera.
  if (!estimate || estimate.status === 'draft') return reply(404, { error: 'not_found' })
  const { data: publication, error: publicationError } = await admin
    .from('estimate_publications')
    .select('snapshot, source')
    .eq('estimate_id', estimate.id)
    .eq('tenant_id', estimate.tenant_id)
    .maybeSingle()
  if (publicationError || !publication) return reply(500, { error: 'publication_missing' })
  const snapshot = publication.snapshot as Record<string, Record<string, unknown>>
  const publishedEstimate = snapshot.estimate
  const publishedTenant = snapshot.tenant
  const publishedClient = snapshot.client
  if (!publishedEstimate || !publishedTenant || !publishedClient)
    return reply(500, { error: 'publication_invalid' })

  if (action !== 'view') {
    if (estimate.status !== 'sent')
      return reply(409, { error: 'already_responded', status: estimate.status })
    if (String(estimate.valid_until) < new Date().toISOString().slice(0, 10))
      return reply(409, { error: 'expired' })
    if (action === 'accept' && name.length < 2) return reply(422, { error: 'name_required' })
    if (name.length > 120) return reply(422, { error: 'name_too_long' })

    const respondedAt = new Date().toISOString()
    const { data: updated, error: updateError } = await admin
      .from('estimates')
      .update({
        status: action === 'accept' ? 'accepted' : 'rejected',
        responded_at: respondedAt,
        responded_by: name || null,
      })
      .eq('id', estimate.id)
      .eq('status', 'sent')
      .select('id')
    if (updateError) return reply(500, { error: 'response_failed' })
    // Si dos personas responden a la vez, solo gana la primera.
    if (!updated?.length) return reply(409, { error: 'already_responded' })
    estimate.status = action === 'accept' ? 'accepted' : 'rejected'
    estimate.responded_at = respondedAt
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
        console.error(
          'public-estimate: no se pudo avisar de la apertura',
          error instanceof Error ? error.message : 'desconocido',
        )
      })
    }
  }

  if (action !== 'view') {
    // Aviso al dueño. Si falla el correo, la respuesta del cliente ya está guardada y no se le molesta.
    await notifyOwner(estimate, tenant, client, action === 'accept').catch((error) => {
      // eslint-disable-next-line no-console -- único rastro del fallo del aviso en los logs de la función
      console.error(
        'public-estimate: no se pudo avisar',
        error instanceof Error ? error.message : 'desconocido',
      )
    })
  }

  // Explicit output contract: adding a database column can never expose it via the public link.
  const publicEstimate = {
    id: publishedEstimate.id,
    tenant_id: publishedEstimate.tenant_id,
    number: publishedEstimate.number,
    client_id: publishedEstimate.client_id,
    title: publishedEstimate.title,
    status: estimate.status,
    vat_rate: publishedEstimate.vat_rate,
    discount_type: publishedEstimate.discount_type,
    discount_value: publishedEstimate.discount_value,
    clauses: publishedEstimate.clauses,
    valid_until: publishedEstimate.valid_until,
    created_at: publishedEstimate.created_at,
    responded_at: estimate.responded_at,
    responded_by: estimate.responded_by,
    estimate_lines: publishedEstimate.estimate_lines,
    estimate_milestones: publishedEstimate.estimate_milestones,
  }
  const publicTenant = {
    id: publishedTenant.id,
    name: publishedTenant.name,
    legal_name: publishedTenant.legal_name,
    tax_id: publishedTenant.tax_id,
    email: publishedTenant.email,
    phone: publishedTenant.phone,
    address: publishedTenant.address,
    postal_code: publishedTenant.postal_code,
    city: publishedTenant.city,
    website: publishedTenant.website,
    brand_color: publishedTenant.brand_color,
    logo_url: publishedTenant.logo_url,
    document_footer: publishedTenant.document_footer,
  }
  const publicClient = {
    id: publishedClient.id,
    tenant_id: publishedClient.tenant_id,
    name: publishedClient.name,
    address: publishedClient.address,
  }
  return reply(200, {
    estimate: publicEstimate,
    tenant: publicTenant,
    client: publicClient,
    publicationSource: publication.source,
  })
})
