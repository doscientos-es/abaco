import { Button, Checkbox, Skeleton, toast } from '@doscientos/ui'
import { MagnifyingGlassIcon, PlusIcon, UsersThreeIcon } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { fuzzySearch } from '@/shared/domain/fuzzy-search'
import { TextField } from '@/shared/ui/form'
import { EmptyPanel } from '@/shared/ui/page-states'
import { TablePagination, usePagination } from '@/shared/ui/use-pagination'

import { workTeamsQuery } from '../application/work-team-actions'
import type { WorkTeam } from '../domain/work-team'
import { WorkTeamCard } from './work-team-card'
import { WorkTeamForm, type TeamPerson } from './work-team-form'

export function WorkTeamsSection({ tenantId, people }: { tenantId: string; people: TeamPerson[] }) {
  const teams = useQuery(workTeamsQuery(tenantId))
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<WorkTeam | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const hasTeams = Boolean(teams.data?.length)
  const isSearching = Boolean(search.trim())
  const peopleById = new Map(people.map((person) => [person.id, person.label]))
  const visible = (teams.data ?? [])
    .filter((team) => showArchived || !team.archived)
    .map((team) => ({
      team,
      members: team.memberIds.map((id) => ({ id, label: peopleById.get(id) ?? '' })),
    }))
    .filter(({ team, members }) =>
      fuzzySearch(search, team.name, team.description, ...members.map(({ label }) => label)),
    )
  const pager = usePagination(visible, `${tenantId}:${search}:${showArchived}`)
  const createButton = (
    <Button onPress={() => setEditing('new')}>
      <PlusIcon aria-hidden="true" />
      Crear equipo
    </Button>
  )

  return (
    <section aria-labelledby="work-teams-heading" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 id="work-teams-heading" className="text-lg font-semibold">
            Equipos de trabajo
          </h2>
          <p className="text-muted-foreground text-sm">
            Agrupa a las personas que trabajan juntas para asignarlas a un trabajo en un solo paso.
          </p>
        </div>
        {teams.isSuccess && hasTeams && people.length > 0 ? createButton : null}
      </header>
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
            if (editing === 'new') setSearch('')
            await queryClient.invalidateQueries({ queryKey: workTeamsQuery(tenantId).queryKey })
            setEditing(null)
            toast.success('Equipo guardado')
          }}
        />
      ) : null}
      {teams.isSuccess ? (
        <>
          {hasTeams ? (
            <div className="flex flex-wrap items-end gap-3">
              <TextField
                className="w-full sm:max-w-sm"
                label="Buscar equipos"
                value={search}
                onChange={setSearch}
                placeholder="Nombre, descripción o integrante"
                icon={<MagnifyingGlassIcon aria-hidden="true" className="size-4" />}
              />
              <div className="flex min-h-9 items-center">
                <Checkbox isSelected={showArchived} onChange={setShowArchived}>
                  Incluir archivados
                </Checkbox>
              </div>
              <output className="text-muted-foreground flex min-h-9 items-center text-sm sm:ml-auto">
                {visible.length} {visible.length === 1 ? 'equipo' : 'equipos'}
              </output>
            </div>
          ) : null}
          {hasTeams && !people.length ? (
            <p className="text-muted-foreground text-sm">
              Para crear un equipo, primero{' '}
              <Link
                to="/trabajadores"
                search={{ vista: 'personas' }}
                className="text-primary underline underline-offset-4"
              >
                añade personas
              </Link>{' '}
              a la empresa.
            </p>
          ) : null}
          {visible.length ? (
            <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {pager.pageItems.map(({ team, members }) => (
                <WorkTeamCard
                  key={team.id}
                  team={team}
                  members={members}
                  onEdit={() => setEditing(team)}
                />
              ))}
            </ul>
          ) : (
            <EmptyPanel
              icon={<UsersThreeIcon aria-hidden="true" />}
              title={
                isSearching
                  ? 'No hay equipos que coincidan'
                  : hasTeams
                    ? 'Solo hay equipos archivados'
                    : 'Organiza tu primer equipo'
              }
              description={
                isSearching
                  ? 'Prueba con otro nombre, descripción o integrante.'
                  : hasTeams
                    ? 'Puedes consultar sus integrantes o reactivarlos desde la edición.'
                    : people.length
                      ? 'Crea un equipo y elige a sus integrantes. Esto no cambia sus permisos ni ocupa plazas adicionales.'
                      : 'Añade personas a la empresa antes de crear un equipo.'
              }
            >
              {isSearching ? (
                <Button variant="outline" onPress={() => setSearch('')}>
                  Limpiar búsqueda
                </Button>
              ) : hasTeams ? (
                <Button variant="outline" onPress={() => setShowArchived(true)}>
                  Ver archivados
                </Button>
              ) : people.length ? (
                createButton
              ) : (
                <Link
                  to="/trabajadores"
                  search={{ vista: 'personas' }}
                  className="text-primary text-sm font-medium underline underline-offset-4"
                >
                  Ir a Personas
                </Link>
              )}
            </EmptyPanel>
          )}
          {visible.length > 10 ? <TablePagination controller={pager} noun="equipos" /> : null}
        </>
      ) : null}
    </section>
  )
}
