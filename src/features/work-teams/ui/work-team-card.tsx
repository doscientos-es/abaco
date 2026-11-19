import { Badge, IconButton } from '@doscientos/ui'
import { ArrowRightIcon, PencilSimpleIcon, UsersThreeIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'

import type { WorkTeam } from '../domain/work-team'
import type { TeamPerson } from './work-team-form'

const previewLimit = 3

export function WorkTeamCard({
  team,
  members,
  onEdit,
}: {
  team: WorkTeam
  members: TeamPerson[]
  onEdit: () => void
}) {
  const overflow = members.length - previewLimit
  return (
    <li className="border-border bg-card hover:border-primary/40 flex min-w-0 flex-col gap-3 rounded-xl border p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="bg-primary/5 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
          <UsersThreeIcon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="text-sm font-semibold break-words">
            <Link
              to="/trabajadores"
              search={{ equipo: team.id }}
              className="text-primary focus-visible:ring-ring inline-flex max-w-full items-center gap-1.5 rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="min-w-0">{team.name}</span>
              <ArrowRightIcon aria-hidden="true" className="size-3.5 shrink-0" />
            </Link>
          </h3>
          <Badge variant={team.archived ? 'neutral' : members.length ? 'success' : 'outline'}>
            {team.archived ? 'Archivado' : members.length ? 'Activo' : 'Sin integrantes'}
          </Badge>
        </div>
        <IconButton label={`Editar ${team.name}`} variant="ghost" onPress={onEdit}>
          <PencilSimpleIcon aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
      {team.description ? (
        <p className="text-muted-foreground line-clamp-2 text-sm break-words whitespace-pre-line">
          {team.description}
        </p>
      ) : null}
      <div className="border-border mt-auto space-y-2 border-t pt-3">
        {members.length ? (
          <>
            <p className="text-muted-foreground text-xs">
              {members.length} {members.length === 1 ? 'integrante' : 'integrantes'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {members.slice(0, previewLimit).map(({ id, label }) => (
                <span
                  key={id}
                  className="bg-muted max-w-full truncate rounded-md px-2 py-1 text-xs"
                >
                  {label || 'Miembro de la empresa'}
                </span>
              ))}
              {overflow > 0 ? (
                <span className="text-muted-foreground px-1 py-1 text-xs">+{overflow} más</span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-xs">No hay personas en este equipo.</p>
        )}
      </div>
    </li>
  )
}
