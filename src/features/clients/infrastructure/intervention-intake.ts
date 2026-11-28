import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type InterventionIntake = {
  id: string
  centre_name: string | null
  created_at: string
  expires_at: string
  revoked_at: string | null
  request: {
    id: string
    address: string
    availability: string
    status: 'pending' | 'reviewed' | 'dismissed'
    received_at: string
    photo_ids: string[]
  } | null
}
function message(code: string) {
  if (code === '42501' || code === 'P0402')
    return 'No tienes permiso o la empresa está en modo de solo lectura.'
  if (code === 'P0429')
    return 'Se alcanzó el límite de enlaces para esta empresa. Inténtalo más tarde.'
  if (code === 'P0409' || code === 'P0002')
    return 'El enlace o la solicitud cambió. Vuelve a cargar el listado.'
  return 'No se pudo confirmar el cambio. Comprueba tu conexión.'
}
export async function listInterventionIntake(tenantId: string, clientId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('list_intervention_intake', {
    p_tenant: tenantId,
    p_client: clientId,
  })
  if (error) throw new Error(message(error.code))
  return (data ?? []) as InterventionIntake[]
}
export async function createInterventionInvite(
  tenantId: string,
  clientId: string,
  centreId: string | null,
) {
  const { data, error } = await createBrowserSupabaseClient().rpc('create_intervention_invite', {
    p_tenant: tenantId,
    p_client: clientId,
    p_centre: centreId,
  })
  if (error || !data) throw new Error(message(error?.code ?? ''))
  return data as { token: string; expires_at: string }
}
export async function changeInterventionIntake(
  tenantId: string,
  inviteId: string,
  action: 'revoke' | 'reviewed' | 'dismissed',
) {
  const { error } = await createBrowserSupabaseClient().rpc('update_intervention_intake', {
    p_tenant: tenantId,
    p_invite: inviteId,
    p_action: action,
  })
  if (error) throw new Error(message(error.code))
}
export async function loadInterventionPhoto(tenantId: string, photoId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('read_intervention_photo', {
    p_tenant: tenantId,
    p_photo: photoId,
  })
  if (error || typeof data !== 'string') throw new Error('Esta foto privada no está disponible.')
  const bytes = Uint8Array.from(atob(data), (unit) => unit.charCodeAt(0))
  return new Blob([bytes], { type: 'image/jpeg' })
}
