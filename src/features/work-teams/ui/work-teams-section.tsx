import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { workTeamsQuery } from '../application/work-team-actions'
import { workTeamLabel, type WorkTeam } from '../domain/work-team'
import { WorkTeamForm, type TeamPerson } from './work-team-form'

export function WorkTeamsSection({
  tenantId,
  people,
  peopleReady,
}: {
  tenantId: string
  people: TeamPerson[]
  peopleReady: boolean
}) {
  const teams = useQuery(workTeamsQuery(tenantId))
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<WorkTeam | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const visible = teams.data?.filter((team) => showArchived || !team.archived) ?? []
  const peopleById = new Map(people.map((person) => [person.id, person.label]))

  return (
    <section
      aria-labelledby="work-teams-heading"
      className="border-border bg-card space-y-4 rounded-lg border p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="work-teams-heading" className="text-sm font-semibold">
            Equipos de trabajo
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Agrupa personas para asignarlas a los trabajos sin repetir la selección.
          </p>
        </div>
        {!editing ? (
          <Button
            variant="outline"
            isDisabled={!peopleReady || teams.isPending || teams.isError}
            onPress={() => setEditing('new')}
          >
            Crear equipo
          </Button>
        ) : null}
      </div>
      {teams.isPending ? (
        <output className="text-muted-foreground text-sm">Cargando equipos…</output>
      ) : null}
      {teams.isError ? (
        <div role="alert" className="space-y-2 text-sm">
          <p className="text-destructive">{teams.error.message}</p>
          <Button variant="outline" onPress={() => void teams.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {editing ? (
        <WorkTeamForm
          key={editing === 'new' ? 'new' : editing.id}
          tenantId={tenantId}
          team={editing === 'new' ? null : editing}
          people={people}
          onCancel={() => {
            setEditing(null)
            void teams.refetch()
          }}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: workTeamsQuery(tenantId).queryKey })
            setEditing(null)
            toast.success('Equipo guardado')
          }}
        />
      ) : null}
      {teams.isSuccess && !editing ? (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Mostrar archivados
          </label>
          {visible.length ? (
            <ul className="divide-border divide-y">
              {visible.map((team) => (
                <li
                  key={team.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{workTeamLabel(team)}</p>
                    <p className="text-muted-foreground text-xs">
                      {team.memberIds
                        .map((id) => peopleById.get(id) ?? 'Miembro de la empresa')
                        .join(' · ') || 'Añade personas antes de asignar este equipo.'}
                    </p>
                    {team.description ? (
                      <p className="text-muted-foreground mt-1 text-xs whitespace-pre-line">
                        {team.description}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="outline"
                    isDisabled={!peopleReady}
                    aria-label={`Editar ${team.name}`}
                    onPress={() => setEditing(team)}
                  >
                    Editar
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              {teams.data.length
                ? 'No hay equipos activos. Muestra los archivados para reactivarlos.'
                : 'Aún no hay equipos. Puedes seguir asignando un responsable individual o crear tu primer grupo.'}
            </p>
          )}
        </>
      ) : null}
    </section>
  )
}
