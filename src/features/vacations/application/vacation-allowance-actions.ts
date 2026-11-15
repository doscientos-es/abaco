import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { fetchAllPages } from '@/shared/lib/supabase/fetch-all-pages'

export const DEFAULT_VACATION_ALLOWANCE = 23
export type VacationAllowance = { worker_id: string; annual_days: number }

export function validVacationAllowance(value: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(value) && Number(value) <= 366
}

export const vacationAllowancesQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['vacation-allowances', tenantId],
    queryFn: () =>
      fetchAllPages<VacationAllowance>(
        (from, to) =>
          createBrowserSupabaseClient()
            .from('worker_vacation_allowances')
            .select('worker_id, annual_days')
            .eq('tenant_id', tenantId)
            .order('worker_id')
            .range(from, to),
        'No se pudieron cargar los días de vacaciones.',
      ),
  })

export async function saveVacationAllowance(
  tenantId: string,
  workerId: string,
  annualDays: number,
) {
  const { error } = await createBrowserSupabaseClient().rpc('save_worker_vacation_allowance', {
    p_tenant_id: tenantId,
    p_worker_id: workerId,
    p_annual_days: annualDays,
  })
  if (error)
    throw new Error('No se pudo guardar el cupo. Revisa tus permisos e inténtalo de nuevo.')
}
