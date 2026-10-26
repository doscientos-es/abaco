import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type ManualEstimateAcceptance = {
  accepted_at: string
  accepted_by: string
  evidence_description: string
}

export async function loadManualEstimateAcceptance(
  tenantId: string,
  estimateId: string,
): Promise<ManualEstimateAcceptance | null> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('estimate_manual_acceptances')
    .select('accepted_at,accepted_by,evidence_description')
    .eq('tenant_id', tenantId)
    .eq('estimate_id', estimateId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as ManualEstimateAcceptance | null
}

export async function acceptEstimateManually(
  tenantId: string,
  estimateId: string,
  operationId: string,
  acceptedBy: string,
  evidenceDescription: string,
): Promise<string> {
  const { data, error } = await createBrowserSupabaseClient().rpc('accept_estimate_manually', {
    p_tenant_id: tenantId,
    p_estimate_id: estimateId,
    p_operation_id: operationId,
    p_accepted_by: acceptedBy.trim(),
    p_evidence_description: evidenceDescription.trim(),
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo registrar la aceptación manual.')
  return data
}
