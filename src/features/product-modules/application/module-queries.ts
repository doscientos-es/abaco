import { queryOptions, useQuery } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { ModuleCode } from '../domain/modules'
import {
  listEnabledModules,
  listModuleRates,
  listModuleSubscriptions,
} from '../infrastructure/module-repository'

export { scheduleModule } from '../infrastructure/module-repository'

export async function setTenantModuleGift(tenantId: string, code: ModuleCode, gifted: boolean) {
  const { error } = await createBrowserSupabaseClient().rpc('superadmin_set_tenant_module_gift', {
    p_tenant: tenantId,
    p_module: code,
    p_gifted: gifted,
  })
  if (error) {
    throw new Error(
      error.code === 'P0001' ? error.message : 'No se pudo actualizar el regalo del módulo.',
    )
  }
}

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

/** Staff is included from Equipo onwards, rather than sold as a paid module. */
export const staffModuleQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['product-modules', 'staff', tenantId],
    queryFn: async () => {
      const { data, error } = await createBrowserSupabaseClient().rpc('can_use_staff', {
        p_tenant: tenantId,
      })
      if (error) throw error
      return data === true
    },
  })

export function useStaffModule(tenantId: string): boolean {
  const { data } = useQuery(staffModuleQuery(tenantId))
  return data === true
}

export function useModuleEnabled(tenantId: string, code: ModuleCode): boolean {
  const { data, isSuccess } = useQuery(tenantModulesQuery(tenantId))
  return isSuccess && data.includes(code)
}
