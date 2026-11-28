import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type StaffArrivalDraft = {
  instructions: string
  parking: string
  contact_label: string
  contact_phone: string
  share_directions: boolean
  share_contact: boolean
}
type StaffArrivalRow = StaffArrivalDraft & { updated_at: string }

export async function loadStaffArrival(tenantId: string, locationId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_location_staff_arrival')
    .select(
      'instructions,parking,contact_label,contact_phone,share_directions,share_contact,updated_at',
    )
    .eq('tenant_id', tenantId)
    .eq('location_id', locationId)
    .maybeSingle()
  if (error) throw new Error('No se pudo consultar la ficha de llegada.')
  return (data as StaffArrivalRow | null) ?? null
}

export async function saveStaffArrival(
  tenantId: string,
  locationId: string,
  draft: StaffArrivalDraft,
  expectedUpdatedAt: string | null,
) {
  const table = createBrowserSupabaseClient().from('service_location_staff_arrival')
  const query = expectedUpdatedAt
    ? table
        .update(draft)
        .eq('tenant_id', tenantId)
        .eq('location_id', locationId)
        .eq('updated_at', expectedUpdatedAt)
    : table.insert({ ...draft, tenant_id: tenantId, location_id: locationId })
  const { data, error } = await query.select('updated_at').maybeSingle()
  if (error?.code === '23505' || (!error && !data)) {
    throw new Error(
      'La ficha ha cambiado o no se pudo editar. Vuelve a abrirla para revisar la versión actual.',
    )
  }
  if (error) throw new Error('No se pudo guardar la ficha. Revisa los datos y tus permisos.')
}
