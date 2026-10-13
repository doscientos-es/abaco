import type { Tenant } from '@/shared/domain/types'
import { updateTenantData } from '@/shared/store/store'

export function patchTenant(patch: Partial<Omit<Tenant, 'id' | 'nextEstimateNumber'>>): void {
  updateTenantData((data) => ({ ...data, tenant: { ...data.tenant, ...patch } }))
}
