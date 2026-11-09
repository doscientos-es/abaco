import type { DashboardConfig } from '@/shared/domain/types'
import { updateTenantData } from '@/shared/store/store'

/** The tenant row is company scoped and RLS only permits owner/admin edits. */
export function saveDashboardConfig(config: DashboardConfig) {
  updateTenantData((data) => ({ ...data, tenant: { ...data.tenant, dashboardConfig: config } }))
}
