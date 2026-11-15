import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import { locationInput, type LocationInput, type ServiceLocation } from '../domain/client-location'
import { insertClientLocation, updateClientLocation } from './client-location-repository'

export type { ServiceLocation } from '../domain/client-location'

export type ClientContact = {
  id: string
  name: string
  role: 'primary' | 'administrative' | 'technical' | 'other'
  email: string
  phone: string
  active: boolean
  updated_at: string
}

export type ClientPassport = {
  contacts: ClientContact[]
  locations: ServiceLocation[]
}

function assertRows<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message)
  return result.data ?? []
}

/** Only contacts and service centres are loaded, scoped to one company and client. */
export async function loadClientPassport(
  tenantId: string,
  clientId: string,
): Promise<ClientPassport> {
  const db = createBrowserSupabaseClient()
  const [contactsResult, locationsResult] = await Promise.all([
    db
      .from('client_contacts')
      .select('id,name,role,email,phone,active,updated_at')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .order('created_at'),
    db
      .from('service_locations')
      .select(
        'id,name,kind,address,city,postal_code,latitude,longitude,opening_hours,operational_contact,access_notes,notes,active,updated_at',
      )
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .order('created_at'),
  ])
  return {
    contacts: assertRows<ClientContact>(contactsResult),
    locations: assertRows<ServiceLocation>(locationsResult),
  }
}

export async function createContact(input: {
  tenantId: string
  clientId: string
  name: string
  role: ClientContact['role']
  email: string
  phone: string
}): Promise<void> {
  const { error } = await createBrowserSupabaseClient().from('client_contacts').insert({
    tenant_id: input.tenantId,
    client_id: input.clientId,
    name: input.name.trim(),
    role: input.role,
    email: input.email.trim(),
    phone: input.phone.trim(),
  })
  if (error) throw new Error(error.message)
}

export async function createLocation(input: {
  tenantId: string
  clientId: string
  name: string
  kind: ServiceLocation['kind']
  address: string
  city: string
  postalCode?: string
  coordinates?: string
  openingHours?: string
  operationalContact?: string
  accessNotes?: string
  notes?: string
  active?: boolean
}): Promise<string> {
  const location = await insertClientLocation(input.tenantId, input.clientId, crypto.randomUUID(), {
    ...locationInput(),
    name: input.name,
    kind: input.kind,
    address: input.address,
    city: input.city,
    postal_code: input.postalCode ?? '',
    coordinates: input.coordinates ?? '',
    opening_hours: input.openingHours ?? '',
    operational_contact: input.operationalContact ?? '',
    access_notes: input.accessNotes ?? '',
    notes: input.notes ?? '',
    active: input.active ?? true,
  })
  return location.id
}

export async function updateContact(
  tenantId: string,
  contact: ClientContact,
  input: Pick<ClientContact, 'name' | 'role' | 'email' | 'phone'>,
): Promise<void> {
  assertOne(
    await createBrowserSupabaseClient()
      .from('client_contacts')
      .update({
        name: input.name.trim(),
        role: input.role,
        email: input.email.trim(),
        phone: input.phone.trim(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', contact.id)
      .eq('updated_at', contact.updated_at)
      .select('id'),
  )
}

export async function updateLocation(
  tenantId: string,
  location: ServiceLocation,
  input: Omit<LocationInput, 'postal_code' | 'coordinates'> & {
    postal_code?: string
    coordinates?: string
  },
): Promise<void> {
  await updateClientLocation(tenantId, location, {
    ...input,
    postal_code: input.postal_code ?? location.postal_code,
    coordinates: input.coordinates ?? locationInput(location).coordinates,
  })
}

function assertOne(result: { data: { id: string }[] | null; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message)
  if (!result.data?.length) throw new Error('El registro cambió en otra sesión. Recarga la ficha.')
}
