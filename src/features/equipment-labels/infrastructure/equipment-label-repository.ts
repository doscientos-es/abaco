import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { LabelAction, LabelOption, ScannedEquipment } from '../domain/equipment-label'

const pageSize = 20

export async function listCentreEquipmentLabels(
  tenantId: string,
  locationId: string,
  page: number,
) {
  const { data, error } = await createBrowserSupabaseClient().rpc('list_centre_equipment_labels', {
    p_tenant: tenantId,
    p_location: locationId,
    p_offset: page * pageSize,
  })
  if (error) throw new Error('list_failed')
  const rows = (data ?? []) as LabelOption[]
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize }
}

export async function changeEquipmentLabel(input: {
  tenantId: string
  locationId: string
  equipmentId: string
  expected: number
  action: LabelAction
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('change_equipment_label', {
    p_tenant: input.tenantId,
    p_location: input.locationId,
    p_equipment: input.equipmentId,
    p_expected: input.expected,
    p_action: input.action,
    p_operation: input.operationId,
  })
  if (error || typeof data !== 'number')
    throw new Error(error?.code === 'P0409' ? 'conflict' : 'save_failed')
  return data
}

export async function scanEquipmentLabel(tenantId: string, token: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('scan_equipment_label', {
    p_tenant: tenantId,
    p_token: token,
  })
  if (error) throw new Error('scan_failed')
  return (data ?? null) as ScannedEquipment | null
}
