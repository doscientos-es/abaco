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
  active: boolean
  updated_at: string
}

export type ServiceAsset = {
  id: string
  location_id: string
  kind: 'pool' | 'generic'
  name: string
  status: 'active' | 'out_of_season' | 'inactive' | 'retired'
  description: string
  updated_at: string
}

export type PoolProfile = {
  asset_id: string
  volume_m3: number | null
  treatment: string
  use_kind: 'private' | 'community' | 'public' | 'other'
  pool_kind: 'outdoor' | 'indoor' | 'spa' | 'other'
  length_m: number | null
  width_m: number | null
  average_depth_m: number | null
  lining: string
  season_notes: string
  updated_at: string
}

export type PoolInput = {
  name: string
  volumeM3: number | null
  treatment: string
  useKind: PoolProfile['use_kind']
  poolKind: PoolProfile['pool_kind']
  lengthM: number | null
  widthM: number | null
  averageDepthM: number | null
  lining: string
  seasonNotes: string
}

export type InstalledEquipment = {
  id: string
  asset_id: string
  replaces_equipment_id: string | null
  kind: string
  manufacturer: string
  model: string
  serial_number: string
  specifications: string
  supplier: string
  installed_at: string | null
  warranty_ends_at: string | null
  status: 'active' | 'replaced' | 'transferred' | 'retired'
  notes: string
  updated_at: string
}

export type EquipmentInput = {
  kind: string
  manufacturer: string
  model: string
  serialNumber: string
  supplier: string
  installedAt: string | null
  warrantyEndsAt: string | null
  specifications: string
  notes: string
}

export type PassportHistory = {
  id: string
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown>
  changed_at: string
}

export type AssetHistory = PassportHistory & {
  asset_id: string
  source: 'asset' | 'pool_profile'
}
export type EquipmentHistory = PassportHistory & { equipment_id: string; asset_id: string }

export type ClientPassport = {
  contacts: ClientContact[]
  locations: ServiceLocation[]
  assets: ServiceAsset[]
  pools: PoolProfile[]
  equipment: InstalledEquipment[]
  assetHistory: AssetHistory[]
  equipmentHistory: EquipmentHistory[]
}

function assertRows<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message)
  return result.data ?? []
}

/** Queries are scoped to one company and one client; internal equipment costs are never selected. */
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
      .select('id,name,kind,address,city,postal_code,opening_hours,active,updated_at')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .order('created_at'),
  ])
  const contacts = assertRows<ClientContact>(contactsResult)
  const locations = assertRows<ServiceLocation>(locationsResult)
  const locationIds = locations.map((location) => location.id)
  if (locationIds.length === 0)
    return {
      contacts,
      locations,
      assets: [],
      pools: [],
      equipment: [],
      assetHistory: [],
      equipmentHistory: [],
    }

  const assets = assertRows<ServiceAsset>(
    await db
      .from('service_assets')
      .select('id,location_id,kind,name,status,description,updated_at')
      .eq('tenant_id', tenantId)
      .in('location_id', locationIds)
      .order('created_at'),
  )
  const assetIds = assets.map((asset) => asset.id)
  if (assetIds.length === 0)
    return {
      contacts,
      locations,
      assets,
      pools: [],
      equipment: [],
      assetHistory: [],
      equipmentHistory: [],
    }

  const [poolsResult, equipmentResult, assetHistoryResult, equipmentHistoryResult] =
    await Promise.all([
      db
        .from('pool_profiles')
        .select(
          'asset_id,volume_m3,treatment,use_kind,pool_kind,length_m,width_m,average_depth_m,lining,season_notes,updated_at',
        )
        .eq('tenant_id', tenantId)
        .in('asset_id', assetIds),
      db
        .from('installed_equipment')
        .select(
          'id,asset_id,replaces_equipment_id,kind,manufacturer,model,serial_number,specifications,supplier,installed_at,warranty_ends_at,status,notes,updated_at',
        )
        .eq('tenant_id', tenantId)
        .in('asset_id', assetIds)
        .order('created_at'),
      db
        .from('service_asset_history')
        .select('id,asset_id,source,before_state,after_state,changed_at')
        .eq('tenant_id', tenantId)
        .in('asset_id', assetIds)
        .order('changed_at', { ascending: false })
        .limit(50),
      db
        .from('installed_equipment_history')
        .select('id,equipment_id,asset_id,before_state,after_state,changed_at')
        .eq('tenant_id', tenantId)
        .in('asset_id', assetIds)
        .order('changed_at', { ascending: false })
        .limit(50),
    ])
  const equipment = assertRows<InstalledEquipment>(equipmentResult)
  return {
    contacts,
    locations,
    assets,
    pools: assertRows<PoolProfile>(poolsResult),
    equipment,
    assetHistory: assertRows<AssetHistory>(assetHistoryResult),
    equipmentHistory: assertRows<EquipmentHistory>(equipmentHistoryResult),
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
}): Promise<void> {
  const { error } = await createBrowserSupabaseClient().from('service_locations').insert({
    tenant_id: input.tenantId,
    client_id: input.clientId,
    name: input.name.trim(),
    kind: input.kind,
    address: input.address.trim(),
    city: input.city.trim(),
  })
  if (error) throw new Error(error.message)
}

export async function createPool(
  input: PoolInput & {
    tenantId: string
    locationId: string
  },
): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('create_pool_asset', {
    p_tenant_id: input.tenantId,
    p_location_id: input.locationId,
    p_name: input.name.trim(),
    p_volume_m3: input.volumeM3,
    p_treatment: input.treatment.trim(),
    p_use_kind: input.useKind,
    p_pool_kind: input.poolKind,
    p_length_m: input.lengthM,
    p_width_m: input.widthM,
    p_average_depth_m: input.averageDepthM,
    p_lining: input.lining.trim(),
    p_season_notes: input.seasonNotes.trim(),
  })
  if (error) throw new Error(error.message)
}

export async function createEquipment(
  input: EquipmentInput & {
    tenantId: string
    assetId: string
  },
): Promise<void> {
  const { error } = await createBrowserSupabaseClient().from('installed_equipment').insert({
    tenant_id: input.tenantId,
    asset_id: input.assetId,
    kind: input.kind.trim(),
    manufacturer: input.manufacturer.trim(),
    model: input.model.trim(),
    serial_number: input.serialNumber.trim(),
    specifications: input.specifications.trim(),
    supplier: input.supplier.trim(),
    installed_at: input.installedAt,
    warranty_ends_at: input.warrantyEndsAt,
    notes: input.notes.trim(),
  })
  if (error) throw new Error(error.message)
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
  input: Pick<ServiceLocation, 'name' | 'kind' | 'address' | 'city'>,
): Promise<void> {
  assertOne(
    await createBrowserSupabaseClient()
      .from('service_locations')
      .update({
        name: input.name.trim(),
        kind: input.kind,
        address: input.address.trim(),
        city: input.city.trim(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', location.id)
      .eq('updated_at', location.updated_at)
      .select('id'),
  )
}

export async function updatePool(
  tenantId: string,
  asset: ServiceAsset,
  profile: PoolProfile,
  input: PoolInput,
): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('update_pool_asset', {
    p_tenant_id: tenantId,
    p_asset_id: asset.id,
    p_name: input.name.trim(),
    p_volume_m3: input.volumeM3,
    p_treatment: input.treatment.trim(),
    p_use_kind: input.useKind,
    p_pool_kind: input.poolKind,
    p_length_m: input.lengthM,
    p_width_m: input.widthM,
    p_average_depth_m: input.averageDepthM,
    p_lining: input.lining.trim(),
    p_season_notes: input.seasonNotes.trim(),
    p_expected_asset_updated_at: asset.updated_at,
    p_expected_profile_updated_at: profile.updated_at,
  })
  if (error) throw new Error(error.message)
}

export async function updateEquipment(
  tenantId: string,
  equipment: InstalledEquipment,
  input: EquipmentInput,
): Promise<void> {
  assertOne(
    await createBrowserSupabaseClient()
      .from('installed_equipment')
      .update({
        kind: input.kind.trim(),
        manufacturer: input.manufacturer.trim(),
        model: input.model.trim(),
        serial_number: input.serialNumber.trim(),
        specifications: input.specifications.trim(),
        supplier: input.supplier.trim(),
        installed_at: input.installedAt,
        warranty_ends_at: input.warrantyEndsAt,
        notes: input.notes.trim(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', equipment.id)
      .eq('updated_at', equipment.updated_at)
      .select('id'),
  )
}

function assertOne(result: { data: { id: string }[] | null; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message)
  if (!result.data?.length) throw new Error('El registro cambió en otra sesión. Recarga la ficha.')
}

/** The observed timestamp is an optimistic lock; a stale browser cannot overwrite a newer state. */
export async function setAssetStatus(
  tenantId: string,
  asset: ServiceAsset,
  status: ServiceAsset['status'],
): Promise<void> {
  assertOne(
    await createBrowserSupabaseClient()
      .from('service_assets')
      .update({ status })
      .eq('tenant_id', tenantId)
      .eq('id', asset.id)
      .eq('updated_at', asset.updated_at)
      .select('id'),
  )
}

export async function setEquipmentStatus(
  tenantId: string,
  equipment: InstalledEquipment,
  status: InstalledEquipment['status'],
): Promise<void> {
  assertOne(
    await createBrowserSupabaseClient()
      .from('installed_equipment')
      .update({ status })
      .eq('tenant_id', tenantId)
      .eq('id', equipment.id)
      .eq('updated_at', equipment.updated_at)
      .select('id'),
  )
}

export async function transferEquipment(
  tenantId: string,
  equipment: InstalledEquipment,
  targetAssetId: string,
): Promise<void> {
  if (targetAssetId === equipment.asset_id) return
  assertOne(
    await createBrowserSupabaseClient()
      .from('installed_equipment')
      .update({ asset_id: targetAssetId, status: 'active' })
      .eq('tenant_id', tenantId)
      .eq('id', equipment.id)
      .eq('updated_at', equipment.updated_at)
      .select('id'),
  )
}

export async function replaceEquipment(
  tenantId: string,
  equipment: InstalledEquipment,
  input: EquipmentInput,
): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('replace_installed_equipment', {
    p_tenant_id: tenantId,
    p_equipment_id: equipment.id,
    p_expected_updated_at: equipment.updated_at,
    p_kind: input.kind.trim(),
    p_manufacturer: input.manufacturer.trim(),
    p_model: input.model.trim(),
    p_serial_number: input.serialNumber.trim(),
    p_warranty_ends_at: input.warrantyEndsAt,
    p_supplier: input.supplier.trim(),
    p_installed_at: input.installedAt,
    p_specifications: input.specifications.trim(),
    p_notes: input.notes.trim(),
  })
  if (error) throw new Error(error.message)
}
