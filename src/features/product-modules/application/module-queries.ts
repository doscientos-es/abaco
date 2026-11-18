import { queryOptions, useQuery } from '@tanstack/react-query'

import type { ModuleCode } from '../domain/modules'
import {
  listEnabledModules,
  listModuleRates,
  listModuleSubscriptions,
} from '../infrastructure/module-repository'

export { scheduleModule } from '../infrastructure/module-repository'

export const moduleCatalogQuery = queryOptions({
  queryKey: ['product-modules', 'catalog'],
  queryFn: listModuleRates,
})

export const tenantModulesQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['product-modules', 'tenant', tenantId],
    queryFn: () => listEnabledModules(tenantId),
    staleTime: 30_000,
  })

export const moduleSubscriptionsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['product-modules', 'subscriptions', tenantId],
    queryFn: () => listModuleSubscriptions(tenantId),
  })

export function useModuleEnabled(tenantId: string, code: ModuleCode): boolean {
  const { data, isSuccess } = useQuery(tenantModulesQuery(tenantId))
  return isSuccess && data.includes(code)
}
