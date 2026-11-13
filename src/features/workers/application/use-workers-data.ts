import { useQuery } from '@tanstack/react-query'

import { teamQuery } from '@/features/settings/application/team-actions'
import { workTeamsQuery } from '@/features/work-teams'

export function useWorkersData(tenantId: string) {
  const people = useQuery(teamQuery(tenantId))
  const teams = useQuery(workTeamsQuery(tenantId))
  return {
    people: people.data ?? [],
    teams: teams.data ?? [],
    pending: people.isPending || teams.isPending,
    failed: people.isError || teams.isError,
    retry: () => {
      void people.refetch()
      void teams.refetch()
    },
  }
}
