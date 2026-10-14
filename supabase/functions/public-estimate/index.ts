/**
 * Página pública del presupuesto: el cliente ve el presupuesto y lo acepta o rechaza sin tener cuenta.
 * La única credencial es el token del enlace (uuid aleatorio). Solo se exponen los datos que ya salen
 * en el documento del cliente; nunca el IBAN ni datos internos.
 *
 * Body: { token: uuid, action: 'view' | 'accept' | 'reject', name?: string }
 * Respuesta: 200 { estimate, tenant, client } | 4xx { error: 'not_found' | 'expired' | 'already_responded' | ... }
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

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

  // El token y los ids internos no hacen falta en la página.
  const { public_token: _token, ...publicEstimate } = estimate
  return reply(200, { estimate: publicEstimate, tenant, client })
})
