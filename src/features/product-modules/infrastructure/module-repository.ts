import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import {
  isModuleCode,
  isModuleIncludedInPlan,
  modules,
  type ModuleCode,
  type ModuleRate,
  type ModuleSubscription,
} from '../domain/modules'

export async function listModuleRates(): Promise<ModuleRate[]> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('billing_module_catalog')
    .select('code, monthly_cents, yearly_cents')
    .eq('status', 'pilot')
    .order('code')
  if (error) throw error
  return data.flatMap(({ code, monthly_cents, yearly_cents }) =>
    isModuleCode(code) ? [{ code, monthly_cents, yearly_cents }] : [],
  )
}

export async function listEnabledModules(tenantId: string): Promise<ModuleCode[]> {
  const client = createBrowserSupabaseClient()
  const [{ data: tenant, error: tenantError }, { data: rows, error: modulesError }] =
    await Promise.all([
      client.from('tenants').select('plan').eq('id', tenantId).single(),
      client
        .from('tenant_modules')
        .select('module_code,enabled,gifted,billing_module_catalog!inner(code)')
        .eq('tenant_id', tenantId)
        .eq('billing_module_catalog.status', 'pilot'),
    ])
  if (tenantError || modulesError) throw new Error('No se pudieron consultar los módulos.')
  const enabled = (rows ?? [])
    .filter((row) => row.enabled || row.gifted)
    .map((row) => row.module_code)
    .filter(isModuleCode)
  const included = (Object.keys(modules) as ModuleCode[]).filter((code) =>
    isModuleIncludedInPlan(code, tenant.plan),
  )
  return [...new Set([...enabled, ...included])]
}

export async function listModuleSubscriptions(tenantId: string): Promise<ModuleSubscription[]> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('tenant_modules')
    .select('module_code,enabled,next_enabled,gifted,monthly_cents,yearly_cents')
    .eq('tenant_id', tenantId)
  if (error) throw error
  return data.flatMap((row) =>
    isModuleCode(row.module_code) ? [{ ...row, module_code: row.module_code }] : [],
  )
}

export async function scheduleModule(tenantId: string, rate: ModuleRate, enabled: boolean) {
  const { error } = await createBrowserSupabaseClient().rpc('schedule_tenant_module', {
    p_tenant: tenantId,
    p_module: rate.code,
    p_enabled: enabled,
    p_monthly: rate.monthly_cents,
    p_yearly: rate.yearly_cents,
  })
  if (error) {
    throw new Error(error.code === 'P0001' ? error.message : 'No se pudo cambiar el módulo.')
  }
}
