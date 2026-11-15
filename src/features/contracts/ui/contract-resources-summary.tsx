import { useQuery } from '@tanstack/react-query'

import { clientPassportQuery } from '@/features/clients/application/client-location-actions'
import { listTechnicians } from '@/features/visits/application/visit-actions'
import { workTeamsQuery } from '@/features/work-teams/application/work-team-actions'

import type { ServiceContract } from '../application/contract-actions'

export function ContractResourcesSummary({ contract }: { contract: ServiceContract }) {
  const passport = useQuery(clientPassportQuery(contract.tenant_id, contract.client_id))
  const people = useQuery({
    queryKey: ['technicians', contract.tenant_id],
    queryFn: () => listTechnicians(contract.tenant_id),
  })
  const teams = useQuery(workTeamsQuery(contract.tenant_id))
  const location = passport.data?.locations.find((item) => item.id === contract.location_id)
  const responsible = contract.work_team_id
    ? (teams.data?.find((team) => team.id === contract.work_team_id)?.name ??
      'Equipo no disponible')
    : (contract.assigned_user_ids ?? [])
        .map(
          (id) => people.data?.find((person) => person.id === id)?.label ?? 'Persona no disponible',
        )
        .join(', ') || 'Sin asignar'
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground text-xs">Centro</dt>
        <dd className="mt-1 text-sm font-medium">
          {passport.isPending
            ? 'Cargando…'
            : passport.isError
              ? 'No se pudo cargar'
              : (location?.name ?? (contract.location_id ? 'Centro no disponible' : 'Sin asignar'))}
        </dd>
        {location ? (
          <dd className="text-muted-foreground text-sm">
            {[location.address, location.postal_code, location.city].filter(Boolean).join(', ')}
          </dd>
        ) : null}
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Responsables</dt>
        <dd className="mt-1 text-sm font-medium">
          {people.isPending || teams.isPending
            ? 'Cargando…'
            : people.isError || teams.isError
              ? 'No se pudieron cargar'
              : responsible}
        </dd>
      </div>
    </dl>
  )
}
