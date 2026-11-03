import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { WorkTeamRepository } from '../domain/work-team'

export const workTeamRepository: WorkTeamRepository = {
  async list(tenantId) {
    const { data, error } = await createBrowserSupabaseClient()
      .from('work_teams')
      .select('id,name,description,archived_at,updated_at,work_team_members(user_id)')
      .eq('tenant_id', tenantId)
      .order('name')
    if (error) throw new Error('No se pudieron cargar los equipos de trabajo. Inténtalo de nuevo.')
    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      archived: row.archived_at !== null,
      updatedAt: row.updated_at as string,
      memberIds: row.work_team_members.map((member) => member.user_id as string).sort(),
    }))
  },
  async save(input) {
    const { error } = await createBrowserSupabaseClient().rpc('save_work_team', {
      p_tenant_id: input.tenantId,
      p_team_id: input.id,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_name: input.name,
      p_description: input.description,
      p_member_ids: input.memberIds,
      p_archived: input.archived,
      p_operation_id: input.operationId,
    })
    if (error) throw new Error(error.message)
  },
}
