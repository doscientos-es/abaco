import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type ClientContact = {
  id: string
  name: string
  role: 'primary' | 'administrative' | 'technical' | 'other'
  email: string
  phone: string
  active: boolean
  updated_at: string
}

export type ServiceLocation = {
  id: string
  name: string
  kind: 'service' | 'billing' | 'both'
  address: string
  city: string
  postal_code: string
  opening_hours: string
  operational_contact: string
  access_notes: string
  notes: string
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
        'id,name,kind,address,city,postal_code,opening_hours,operational_contact,access_notes,notes,active,updated_at',
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
  operationalContact?: string
  accessNotes?: string
  notes?: string
  active?: boolean
}): Promise<string> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_locations')
    .insert({
      tenant_id: input.tenantId,
      client_id: input.clientId,
      name: input.name.trim(),
      kind: input.kind,
      address: input.address.trim(),
      city: input.city.trim(),
      operational_contact: input.operationalContact?.trim() ?? '',
      access_notes: input.accessNotes?.trim() ?? '',
      notes: input.notes?.trim() ?? '',
      active: input.active ?? true,
    })
    .select('id')
    .single()
  if (error || typeof data?.id !== 'string')
    throw new Error(error?.message ?? 'No se pudo obtener la ubicación creada.')
  return data.id
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
  input: Pick<
    ServiceLocation,
    | 'name'
    | 'kind'
    | 'address'
    | 'city'
    | 'operational_contact'
    | 'access_notes'
    | 'notes'
    | 'active'
  >,
): Promise<void> {
  assertOne(
    await createBrowserSupabaseClient()
      .from('service_locations')
      .update({
        name: input.name.trim(),
        kind: input.kind,
        address: input.address.trim(),
        city: input.city.trim(),
        operational_contact: input.operational_contact.trim(),
        access_notes: input.access_notes.trim(),
        notes: input.notes.trim(),
        active: input.active,
      })
      .eq('tenant_id', tenantId)
      .eq('id', location.id)
      .eq('updated_at', location.updated_at)
      .select('id'),
  )
}

function assertOne(result: { data: { id: string }[] | null; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message)
  if (!result.data?.length) throw new Error('El registro cambió en otra sesión. Recarga la ficha.')
}
