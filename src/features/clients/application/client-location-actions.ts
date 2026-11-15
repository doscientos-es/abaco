import { queryOptions } from '@tanstack/react-query'

import {
  changedLocation,
  validLocationInput,
  type LocationDraft,
  type ServiceLocation,
} from '../domain/client-location'
import {
  insertClientLocation,
  updateClientLocation,
} from '../infrastructure/client-location-repository'
import { loadClientPassport } from './client-passport-actions'

export const clientPassportQuery = (tenantId: string, clientId?: string) =>
  queryOptions({
    queryKey: ['client-passport', tenantId, clientId],
    queryFn: () => {
      if (!clientId) throw new Error('Falta el cliente.')
      return loadClientPassport(tenantId, clientId)
    },
    enabled: Boolean(clientId),
  })

/** Keep successful checkpoints so a retry never repeats a completed centre. */
export async function saveClientLocations(
  tenantId: string,
  clientId: string,
  drafts: LocationDraft[],
  onPersisted: (location: ServiceLocation) => void,
) {
  if (drafts.some(({ input }) => !validLocationInput(input)))
    throw new Error('Revisa el nombre, la dirección y las coordenadas de todos los centros.')
  for (const draft of drafts.filter(changedLocation)) {
    const location = draft.original
      ? await updateClientLocation(tenantId, draft.original, draft.input)
      : await insertClientLocation(tenantId, clientId, draft.id, draft.input)
    onPersisted(location)
  }
}
