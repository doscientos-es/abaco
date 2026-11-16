import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type Supplier = {
  id: string
  tenant_id: string
  name: string
  email: string
  phone: string
}

export type InventoryItem = {
  catalog_item_id: string
  quantity: number
  supplier_id: string | null
  version: number
}

export type MaterialShortage = {
  id: string
  estimate_id: string
  catalog_item_id: string | null
  supplier_id: string | null
  name: string
  sku: string
  unit: string
  missing_quantity: number
  reason: 'insufficient' | 'unit_mismatch'
  resolved_at: string | null
}

export async function listSuppliers(tenantId: string): Promise<Supplier[]> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('suppliers')
    .select('id,tenant_id,name,email,phone')
    .eq('tenant_id', tenantId)
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as Supplier[]
}

export async function saveSupplier(input: Supplier): Promise<void> {
  const { error } = await createBrowserSupabaseClient().from('suppliers').upsert(input)
  if (error) throw new Error(error.message)
}

export async function listInventory(tenantId: string): Promise<InventoryItem[]> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('inventory_items')
    .select('catalog_item_id,quantity,supplier_id,version')
    .eq('tenant_id', tenantId)
  if (error) throw new Error(error.message)
  return (data ?? []) as InventoryItem[]
}

export async function saveInventory(input: {
  tenantId: string
  catalogItemId: string
  quantity: number
  supplierId: string | null
  expectedVersion: number | null
}): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('save_inventory_item', {
    p_tenant_id: input.tenantId,
    p_catalog_item_id: input.catalogItemId,
    p_quantity: input.quantity,
    p_supplier_id: input.supplierId,
    p_expected_version: input.expectedVersion,
  })
  if (error) throw new Error(error.message)
}

export async function listShortages(
  tenantId: string,
  estimateId?: string,
): Promise<MaterialShortage[]> {
  let query = createBrowserSupabaseClient()
    .from('inventory_shortages')
    .select(
      'id,estimate_id,catalog_item_id,supplier_id,name,sku,unit,missing_quantity,reason,resolved_at',
    )
    .eq('tenant_id', tenantId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
  if (estimateId) query = query.eq('estimate_id', estimateId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as MaterialShortage[]
}

export async function resolveShortage(tenantId: string, id: string): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('resolve_inventory_shortage', {
    p_tenant_id: tenantId,
    p_id: id,
  })
  if (error) throw new Error(error.message)
}
