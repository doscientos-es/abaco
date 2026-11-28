import { queryOptions } from '@tanstack/react-query'

import {
  listCentreEquipmentLabels,
  scanEquipmentLabel,
} from '../infrastructure/equipment-label-repository'

export { changeEquipmentLabel } from '../infrastructure/equipment-label-repository'

export const officeEquipmentLabelsKey = (tenantId: string, userId: string, locationId: string) =>
  ['equipment-labels-office', tenantId, userId, locationId] as const

export const officeEquipmentLabelsQuery = (
  tenantId: string,
  userId: string,
  locationId: string,
  page: number,
) =>
  queryOptions({
    queryKey: [...officeEquipmentLabelsKey(tenantId, userId, locationId), page],
    queryFn: () => listCentreEquipmentLabels(tenantId, locationId, page),
    staleTime: 0,
    retry: false,
    refetchOnMount: 'always',
  })

export const equipmentScanQuery = (
  tenantId: string | null | undefined,
  userId: string | undefined,
  token: string | null,
) =>
  queryOptions({
    queryKey: ['equipment-label-scan', tenantId, userId, token],
    queryFn: () => (tenantId && token ? scanEquipmentLabel(tenantId, token) : null),
    enabled: Boolean(tenantId && userId && token),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  })
