import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type WorkerPersonalData = { dni: string; phone: string }

export const workerPersonalDataQuery = (tenantId: string, workerId: string) =>
  queryOptions({
    queryKey: ['worker-personal-data', tenantId, workerId],
    queryFn: async (): Promise<WorkerPersonalData> => {
      const { data, error } = await createBrowserSupabaseClient()
        .from('worker_personal_data')
        .select('dni, phone')
        .eq('tenant_id', tenantId)
        .eq('worker_id', workerId)
        .maybeSingle()
      if (error) throw new Error('No se pudieron cargar los datos personales.')
      return { dni: data?.dni ?? '', phone: data?.phone ?? '' }
    },
  })

export async function saveWorkerPersonalData(
  tenantId: string,
  workerId: string,
  data: WorkerPersonalData,
): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('save_worker_personal_data', {
    p_tenant_id: tenantId,
    p_worker_id: workerId,
    p_dni: data.dni.trim(),
    p_phone: data.phone.trim(),
  })
  if (error)
    throw new Error(
      'No se pudieron guardar los datos personales. Revisa tus permisos e inténtalo de nuevo.',
    )
}
