import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { clientPassportQuery, saveClientLocations } from '../application/client-location-actions'
import {
  changedLocation,
  locationInput,
  validLocationInput,
  type LocationDraft,
} from '../domain/client-location'

export function useClientLocations(tenantId: string, clientId?: string) {
  const query = useQuery(clientPassportQuery(tenantId, clientId))
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<LocationDraft[] | null>(null)
  const locations =
    drafts ??
    (query.data?.locations ?? []).map((location) => ({
      id: location.id,
      original: location,
      input: locationInput(location),
    }))

  return {
    query,
    locations,
    setLocations: setDrafts,
    isDirty: locations.some(changedLocation),
    invalid:
      Boolean(clientId && !query.isSuccess) ||
      locations.some(({ input }) => !validLocationInput(input)),
    async save(savedClientId: string) {
      try {
        await saveClientLocations(tenantId, savedClientId, locations, (location) => {
          setDrafts((current) =>
            (current ?? locations).map((draft) =>
              draft.id === location.id
                ? { id: location.id, original: location, input: locationInput(location) }
                : draft,
            ),
          )
        })
      } finally {
        void queryClient.invalidateQueries({
          queryKey: ['client-passport', tenantId, savedClientId],
        })
        void queryClient.invalidateQueries({
          queryKey: ['work-target-options', tenantId, savedClientId],
        })
      }
    },
  }
}
