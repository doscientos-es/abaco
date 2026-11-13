import { Badge, Button, Skeleton, toast } from '@doscientos/ui'
import { PlusIcon, UsersThreeIcon } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { fuzzySearch } from '@/shared/domain/fuzzy-search'
import { TextField } from '@/shared/ui/form'
import { EmptyPanel } from '@/shared/ui/page-states'
import { TablePagination, usePagination } from '@/shared/ui/use-pagination'

import { workTeamsQuery } from '../application/work-team-actions'
import type { WorkTeam } from '../domain/work-team'
import { WorkTeamForm, type TeamPerson } from './work-team-form'

export function WorkTeamsSection({
  tenantId,
  people,
  peopleReady,
  onOpenTeam,
}: {
  tenantId: string
  people: TeamPerson[]
  peopleReady: boolean
  onOpenTeam?: ((teamId: string) => void) | undefined
}) {
  const teams = useQuery(workTeamsQuery(tenantId))
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<WorkTeam | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const visible =
    teams.data?.filter(
      (team) =>
        (showArchived || !team.archived) && fuzzySearch(search, team.name, team.description),
    ) ?? []
  const pager = usePagination(visible, `${tenantId}:${search}:${showArchived}`)
  const peopleById = new Map(people.map((person) => [person.id, person.label]))
  const activeCount = teams.data?.filter((team) => !team.archived).length ?? 0
  const archivedCount = (teams.data?.length ?? 0) - activeCount

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
        </div>
        <Button
          variant="outline"
          isDisabled={!peopleReady || !people.length || teams.isPending || teams.isError}
          onPress={() => setEditing('new')}
        >
          <PlusIcon aria-hidden="true" />
          Crear equipo
        </Button>
      </div>
      {teams.isPending ? (
        <div aria-busy="true" className="space-y-2">
          <output className="sr-only">Cargando equipos…</output>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
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
      {teams.isSuccess ? (
        <>
          <TextField
            label="Buscar equipo"
            value={search}
            onChange={setSearch}
            placeholder="Nombre o descripción del equipo"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              {activeCount} {activeCount === 1 ? 'equipo activo' : 'equipos activos'} ·{' '}
              {archivedCount} {archivedCount === 1 ? 'archivado' : 'archivados'}
            </p>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              Mostrar archivados
            </label>
          </div>
          {peopleReady && !people.length ? (
            <p className="text-muted-foreground text-sm">
              Añade personas al equipo de la empresa para poder crear grupos de trabajo.
            </p>
          ) : null}
          {visible.length ? (
            <ul className="grid gap-3 xl:grid-cols-2">
              {pager.pageItems.map((team) => (
                <li
                  key={team.id}
                  className="border-border flex min-w-0 items-start gap-3 rounded-xl border p-4"
                >
                  <span className="bg-primary/5 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <UsersThreeIcon aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold break-words">
                      {onOpenTeam ? (
                        <button
                          type="button"
                          className="text-primary text-left hover:underline"
                          onClick={() => onOpenTeam(team.id)}
                        >
                          {team.name}
                        </button>
                      ) : (
                        team.name
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge
                        variant={
                          team.archived ? 'neutral' : team.memberIds.length ? 'success' : 'danger'
                        }
                      >
                        {team.archived
                          ? 'Archivado'
                          : team.memberIds.length
                            ? 'Activo'
                            : 'Sin personas'}
                      </Badge>
                      <span className="text-muted-foreground self-center text-xs">
                        {team.memberIds.length}{' '}
                        {team.memberIds.length === 1 ? 'persona' : 'personas'}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-2 line-clamp-2 text-xs break-words">
                      {team.memberIds
                        .map((id) => peopleById.get(id) ?? 'Miembro de la empresa')
                        .join(' · ') || 'Añade personas antes de asignar este equipo.'}
                    </p>
                    {team.description ? (
                      <p className="text-muted-foreground mt-2 line-clamp-2 text-xs break-words whitespace-pre-line">
                        {team.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    {onOpenTeam ? (
                      <Button variant="outline" onPress={() => onOpenTeam(team.id)}>
                        Ver equipo
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      isDisabled={!peopleReady}
                      aria-label={`Editar ${team.name}`}
                      onPress={() => setEditing(team)}
                    >
                      Editar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyPanel
              icon={<UsersThreeIcon />}
              title={
                search.trim()
                  ? 'No hay equipos que coincidan'
                  : teams.data.length
                    ? 'No hay equipos activos'
                    : 'Organiza tu primer equipo'
              }
              description={
                search.trim()
                  ? 'Prueba otro nombre o limpia la búsqueda.'
                  : teams.data.length
                    ? 'Muestra los equipos archivados para revisarlos o reactivarlos.'
                    : 'Agrupa a las personas que suelen trabajar juntas. También puedes seguir asignando un responsable individual.'
              }
            >
              {search.trim() ? (
                <Button variant="outline" onPress={() => setSearch('')}>
                  Limpiar búsqueda
                </Button>
              ) : teams.data.length ? (
                <Button variant="outline" onPress={() => setShowArchived(true)}>
                  Ver archivados
                </Button>
              ) : (
                <Button
                  variant="outline"
                  isDisabled={!peopleReady || !people.length}
                  onPress={() => setEditing('new')}
                >
                  Crear primer equipo
                </Button>
              )}
            </EmptyPanel>
          )}
          {visible.length > 10 ? <TablePagination controller={pager} noun="equipos" /> : null}
        </>
      ) : null}
    </section>
  )
}
