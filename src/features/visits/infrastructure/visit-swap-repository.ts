import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type VisitSwapOption = {
  id: string
  version: string
  start_at: string
  end_at: string
  colleague: string
}

export type VisitSwapDecision = 'approved' | 'rejected' | 'withdrawn'

export type VisitSwapProposal = {
  id: string
  state: 'pending' | VisitSwapDecision
  created_at: string
  decided_at: string | null
  own_title: string | null
  other_title: string | null
  requester: string | null
  colleague: string | null
  own_start: string
  own_end: string
  other_start: string
  other_end: string
  stale: boolean
}

function swapError(error: { code: string; message: string }) {
  if (error.code === 'P0409' || error.code === '22023') return new Error(error.message)
  if (error.code === '42501') return new Error('No tienes permiso para esta acción.')
  if (error.code === 'P0402') return new Error('La empresa no puede gestionar intercambios.')
  if (error.code === 'P0002') return new Error('La propuesta ya no está disponible.')
  return new Error('No se pudo confirmar la operación. Vuelve a intentarlo.')
}

export async function listVisitSwapOptions(tenantId: string, ownId: string, day: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('list_visit_swap_options', {
    p_tenant_id: tenantId,
    p_own_id: ownId,
    p_day: day,
  })
  if (error) throw swapError(error)
  return (data ?? []) as VisitSwapOption[]
}

export async function listVisitSwapProposals(tenantId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('list_visit_swap_proposals', {
    p_tenant_id: tenantId,
  })
  if (error) throw swapError(error)
  return (data ?? []) as VisitSwapProposal[]
}

export async function createVisitSwapProposal({
  tenantId,
  id,
  own,
  other,
}: {
  tenantId: string
  id: string
  own: { id: string; updated_at: string }
  other: VisitSwapOption
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('create_visit_swap_proposal', {
    p_tenant_id: tenantId,
    p_id: id,
    p_own_id: own.id,
    p_own_version: own.updated_at,
    p_other_id: other.id,
    p_other_version: other.version,
  })
  if (error) throw swapError(error)
  return data as VisitSwapProposal['state']
}

export async function decideVisitSwapProposal(
  tenantId: string,
  proposal: VisitSwapProposal,
  decision: VisitSwapDecision,
) {
  const { error } = await createBrowserSupabaseClient().rpc('decide_visit_swap_proposal', {
    p_tenant_id: tenantId,
    p_id: proposal.id,
    p_created_at: proposal.created_at,
    p_decision: decision,
  })
  if (error) throw swapError(error)
}
