/**
 * Invita a una persona a una empresa. Necesita service role, por eso vive aquí y no en el
 * navegador. Valida sesión, pertenencia y rol de quien invita antes de actuar.
 *
 * Body: { tenantId: uuid, email: string, role: 'admin' | 'editor' | 'viewer', fullName?: string }
 * El correo lo envía el hook auth-email (Resend) al llamar a inviteUserByEmail.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

type Role = 'owner' | 'admin' | 'editor' | 'viewer'
const invitable: Role[] = ['admin', 'editor', 'viewer']
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return reply(405, { error: 'Método no permitido' })

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey || !serviceKey) return reply(500, { error: 'Función sin configurar' })
  if (!authorization) return reply(401, { error: 'Inicia sesión para invitar' })

  // 1. Identidad real, tomada del token (nunca del body).
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: caller } = await asCaller.auth.getUser()
  if (!caller.user) return reply(401, { error: 'Sesión no válida' })

  // 2. Input.
  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const tenantId = typeof input?.tenantId === 'string' ? input.tenantId : ''
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : ''
  const role = input?.role as Role
  const fullName = typeof input?.fullName === 'string' ? input.fullName.trim().slice(0, 120) : ''
  if (!uuidPattern.test(tenantId) || !emailPattern.test(email) || !invitable.includes(role)) {
    return reply(400, { error: 'Datos no válidos' })
  }

  // 3. Permiso: owner/admin de esa empresa; solo el owner puede dar el rol admin.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: mine } = await admin
    .from('memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', caller.user.id)
    .maybeSingle()
  if (!mine || !['owner', 'admin'].includes(mine.role)) return reply(403, { error: 'No tienes permiso para invitar' })
  if (role === 'admin' && mine.role !== 'owner') return reply(403, { error: 'Solo el propietario puede nombrar administradores' })

  // 4. Invitar (o reutilizar la cuenta si ya existe).
  const invite = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: Deno.env.get('APP_URL') ?? '',
    data: fullName ? { full_name: fullName } : {},
  })
  let userId = invite.data.user?.id
  let status: 'invited' | 'added' = 'invited'
  if (invite.error || !userId) {
    const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
    if (!existing) return reply(502, { error: 'No se pudo enviar la invitación' })
    userId = existing.id
    status = 'added'
  }

  const { error } = await admin
    .from('memberships')
    .upsert({ tenant_id: tenantId, user_id: userId, role, invited_by: caller.user.id }, { onConflict: 'tenant_id,user_id', ignoreDuplicates: true })
  if (error) return reply(500, { error: 'No se pudo añadir a la persona al equipo' })

  return reply(200, { status })
})
