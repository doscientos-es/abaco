import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { teamQuery } from '@/features/settings/application/team-actions'
import { workTeamsQuery } from '@/features/work-teams'
import type { TenantData } from '@/shared/domain/types'

import { businessSearchItems, searchItems, type SearchItem } from '../domain/search'
import { searchRemoteResources } from '../infrastructure/search-repository'

export function useSearchResults(
  data: TenantData | undefined,
  navigation: SearchItem[],
  query: string,
  open: boolean,
) {
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 200)
    return () => clearTimeout(timer)
  }, [query])
  const tenantId = data?.tenant.id ?? ''
  const enabled = open && Boolean(tenantId)
  const people = useQuery({ ...teamQuery(tenantId), enabled, staleTime: 30_000 })
  const teams = useQuery({ ...workTeamsQuery(tenantId), enabled, staleTime: 30_000 })
  const remote = useQuery({
    queryKey: ['global-search', tenantId, debounced],
    queryFn: ({ signal }) => searchRemoteResources(tenantId, debounced, signal),
    enabled: enabled && debounced.length >= 2,
    staleTime: 30_000,
    retry: 1,
  })
  const business = useMemo(() => (data ? businessSearchItems(data) : []), [data])
  const currentRemote = debounced.length >= 2 && debounced === query.trim()
  const items: SearchItem[] = [...navigation, ...business]
  if (enabled) {
    for (const person of people.data ?? [])
      items.push({
        id: `person:${person.userId}`,
        title: person.fullName || person.email,
        category: 'Personas',
        keywords: person.email,
        target: { to: '/trabajadores', search: { persona: person.userId } },
      })
    for (const team of teams.data ?? [])
      if (!team.archived)
        items.push({
          id: `team:${team.id}`,
          title: team.name,
          category: 'Equipos',
          target: { to: '/trabajadores', search: { equipo: team.id } },
        })
    // Query keys prevent late responses from another query or company replacing this list.
    if (currentRemote) items.push(...(remote.data?.items ?? []))
  }
  return {
    items: searchItems(items, query),
    loading:
      enabled &&
      (people.isFetching ||
        teams.isFetching ||
        (query.trim().length >= 2 && (debounced !== query.trim() || remote.isFetching))),
    failed:
      enabled &&
      (people.isError ||
        teams.isError ||
        (currentRemote && (remote.isError || Boolean(remote.data?.failed)))),
    retry: () => {
      void people.refetch()
      void teams.refetch()
      if (currentRemote) void remote.refetch()
    },
  }
}
