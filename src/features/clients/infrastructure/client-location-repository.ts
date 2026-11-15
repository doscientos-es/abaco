import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import {
  locationInput,
  locationPersistenceInput,
  sameLocationInput,
  type LocationInput,
  type ServiceLocation,
} from '../domain/client-location'

const columns =
  'id,name,kind,address,city,postal_code,latitude,longitude,opening_hours,operational_contact,access_notes,notes,active,updated_at'

export async function insertClientLocation(
  tenantId: string,
  clientId: string,
  id: string,
  input: LocationInput,
): Promise<ServiceLocation> {
  const db = createBrowserSupabaseClient()
  const { data, error } = await db
    .from('service_locations')
    .insert({ id, tenant_id: tenantId, client_id: clientId, ...locationPersistenceInput(input) })
    .select(columns)
    .single()
  if (!error && data) return data as ServiceLocation
  if (error?.code !== '23505') throw new Error(error?.message ?? 'No se pudo guardar el centro.')

  // A previous attempt may have committed before its response was lost.
  const existing = await db
    .from('service_locations')
    .select(columns)
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .eq('id', id)
    .maybeSingle()
  if (existing.error || !existing.data || !sameLocationInput(locationInput(existing.data), input))
    throw new Error('No se pudo comprobar el centro guardado. Recarga la ficha.')
  return existing.data as ServiceLocation
}

export async function updateClientLocation(
  tenantId: string,
  location: ServiceLocation,
  input: LocationInput,
): Promise<ServiceLocation> {
  const db = createBrowserSupabaseClient()
  const { data, error } = await db
    .from('service_locations')
    .update(locationPersistenceInput(input))
    .eq('tenant_id', tenantId)
    .eq('id', location.id)
    .eq('updated_at', location.updated_at)
    .select(columns)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data) return data as ServiceLocation

  const existing = await db
    .from('service_locations')
    .select(columns)
    .eq('tenant_id', tenantId)
    .eq('id', location.id)
    .maybeSingle()
  if (existing.error || !existing.data || !sameLocationInput(locationInput(existing.data), input))
    throw new Error('El centro cambió en otra sesión. Recarga la ficha antes de modificarlo.')
  return existing.data as ServiceLocation
}
