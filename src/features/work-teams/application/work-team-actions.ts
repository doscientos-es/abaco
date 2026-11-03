import { queryOptions } from '@tanstack/react-query'

import { workTeamInput, type SaveWorkTeam, type WorkTeamRepository } from '../domain/work-team'
import { workTeamRepository } from '../infrastructure/work-team-repository'

export function createWorkTeamActions(repository: WorkTeamRepository) {
  return {
    list: (tenantId: string) => repository.list(tenantId),
    save: async (input: SaveWorkTeam) => repository.save(workTeamInput.parse(input)),
  }
}

export const workTeamActions = createWorkTeamActions(workTeamRepository)

export const workTeamsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['work-teams', tenantId],
    queryFn: () => workTeamActions.list(tenantId),
  })
