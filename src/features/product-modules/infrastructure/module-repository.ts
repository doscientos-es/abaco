import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import {
  isModuleCode,
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
  const { data, error } = await createBrowserSupabaseClient()
    .from('tenant_modules')
    .select('module_code, billing_module_catalog!inner(code)')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .eq('billing_module_catalog.status', 'pilot')
  if (error) throw error
  return data.map(({ module_code }) => module_code).filter(isModuleCode)
}

export async function listModuleSubscriptions(tenantId: string): Promise<ModuleSubscription[]> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('tenant_modules')
    .select('module_code,enabled,next_enabled,monthly_cents,yearly_cents')
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
