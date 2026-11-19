import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { pendingTeamActivationsQuery, type TeamMember } from '../application/team-actions'

export function PendingTeamActivations({
  tenantId,
  members,
}: {
  tenantId: string
  members: TeamMember[]
}) {
  const pending = useQuery(pendingTeamActivationsQuery(tenantId))
  const people = members.filter((member) => pending.data?.includes(member.userId))

  return (
    <section
      aria-labelledby="pending-activations-heading"
      className="border-border space-y-2 rounded-lg border p-4"
    >
      <h3 id="pending-activations-heading" className="text-sm font-semibold">
        Invitaciones pendientes
      </h3>
      <p className="text-muted-foreground text-xs">
        Personas invitadas que aún no han activado su cuenta.
      </p>
      {pending.isPending ? (
        <p className="text-muted-foreground text-sm">Cargando invitaciones…</p>
      ) : null}
      {pending.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar las invitaciones pendientes.
        </p>
      ) : null}
      {pending.isSuccess && people.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay cuentas pendientes de activar.</p>
      ) : null}
      {pending.isSuccess && people.length > 0 ? (
        <ul className="space-y-2">
          {people.map((person) => (
            <li key={person.userId}>
              <Link
                to="/trabajadores"
                search={{ persona: person.userId }}
                className="text-primary text-sm hover:underline"
              >
                {person.fullName ? `${person.fullName} · ${person.email}` : person.email}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
