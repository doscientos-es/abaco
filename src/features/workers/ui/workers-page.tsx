import { Badge, Button } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { useSession } from '@/features/auth'
import { TeamSection } from '@/features/settings/ui/team-section'
import { StaffFunctionsSection, StaffSchedulesPage } from '@/features/staff-schedules'
import { WorkTeamForm, WorkTeamsSection, workTeamsQuery } from '@/features/work-teams'
import { WorkspacePageHeading, WorkspacePageTabs } from '@/shared/ui/workspace-page-chrome'

import { useWorkersData } from '../application/use-workers-data'
import { WorkerOrganization } from './worker-organization'
import { WorkerVacations } from './worker-vacations'
import { WorkersNavigation } from './workers-navigation'

export function WorkersPage() {
  const session = useSession()
  if (!session?.tenantId) return <p>Selecciona una empresa.</p>
  return <WorkersContent key={session.tenantId} tenantId={session.tenantId} />
}

function WorkersContent({ tenantId }: { tenantId: string }) {
  const search = useSearch({ from: '/trabajadores' })
  const navigate = useNavigate({ from: '/trabajadores' })
  const data = useWorkersData(tenantId)
  const cache = useQueryClient()
  const [editingTeam, setEditingTeam] = useState(false)
  const team = search.equipo ? data.teams.find((item) => item.id === search.equipo) : undefined
  const person = search.persona
    ? data.people.find((item) => item.userId === search.persona)
    : undefined
  const scoped = Boolean(search.equipo || search.persona)
  const requested = search.vista ?? 'personas'
  const view =
    scoped && !['personas', 'horarios', 'vacaciones'].includes(requested) ? 'personas' : requested
  const memberIds = person ? [person.userId] : team?.memberIds
  const title = person ? person.fullName || person.email : (team?.name ?? 'Trabajadores')
  const activeTeams = data.teams.filter((item) => !item.archived)

  if (data.pending) return <output>Cargando trabajadores y equipos…</output>
  if (data.failed)
    return (
      <div role="alert" className="space-y-3">
        <p>No se pudieron cargar los trabajadores y equipos.</p>
        <Button onPress={data.retry}>Reintentar</Button>
      </div>
    )
  if (scoped && !team && !person)
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">No se encontró esta ficha</h1>
        <p>Puede que la persona ya no pertenezca a la empresa o el equipo no esté disponible.</p>
        <Link to="/trabajadores" className="text-primary hover:underline">
          Volver a Trabajadores
        </Link>
      </div>
    )

  return (
    <div className="min-w-0 space-y-6">
      {scoped ? (
        <nav
          aria-label="Ruta de trabajadores"
          className="text-muted-foreground flex flex-wrap gap-2 text-sm"
        >
          <Link to="/trabajadores" className="hover:text-foreground">
            Trabajadores
          </Link>
          <span aria-hidden="true">/</span>
          {team ? (
            <>
              <Link
                to="/trabajadores"
                search={{ vista: 'equipos' }}
                className="hover:text-foreground"
              >
                Equipos
              </Link>
              <span aria-hidden="true">/</span>
            </>
          ) : null}
          <span aria-current="page" className="text-foreground">
            {title}
          </span>
        </nav>
      ) : null}
      <WorkspacePageHeading
        title={title}
        actions={
          team ? (
            <Button variant="outline" onPress={() => setEditingTeam(true)}>
              Editar equipo
            </Button>
          ) : (
            <Link
              to="/ajustes"
              search={{ tab: 'equipo' }}
              className="border-border bg-card hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
            >
              Invitar personas
            </Link>
          )
        }
      />
      <WorkspacePageTabs>
        <WorkersNavigation search={search} view={view} scoped={scoped} />
      </WorkspacePageTabs>
      {person || team?.description || team?.archived ? (
        <div className="space-y-2">
          {person || team?.description ? (
            <p className="text-muted-foreground max-w-2xl text-sm">
              {person ? person.email : team?.description}
            </p>
          ) : null}
          {team?.archived ? <Badge variant="neutral">Equipo archivado</Badge> : null}
        </div>
      ) : null}
      {person ? (
        <div className="flex flex-wrap gap-2" aria-label="Equipos de la persona">
          {activeTeams
            .filter((group) => group.memberIds.includes(person.userId))
            .map((group) => (
              <Link
                key={group.id}
                to="/trabajadores"
                search={{ equipo: group.id }}
                className="border-border hover:bg-muted rounded-full border px-3 py-1 text-xs"
              >
                {group.name} →
              </Link>
            ))}
        </div>
      ) : null}
      {view === 'personas' ? (
        <TeamSection
          key={search.persona ?? search.equipo ?? 'company'}
          tenantId={tenantId}
          memberIds={memberIds}
        />
      ) : null}
      {view === 'equipos' ? (
        <WorkTeamsSection
          tenantId={tenantId}
          peopleReady
          people={data.people.map((item) => ({
            id: item.userId,
            label: item.fullName || item.email,
          }))}
          onOpenTeam={(id) => void navigate({ search: { equipo: id } })}
        />
      ) : null}
      {view === 'horarios' ? (
        <StaffSchedulesPage
          key={search.persona ?? search.equipo ?? 'company'}
          memberIds={memberIds}
          title={scoped ? `Horario · ${title}` : 'Horarios de la empresa'}
          embedded
        />
      ) : null}
      {view === 'vacaciones' ? (
        <WorkerVacations
          key={search.persona ?? search.equipo ?? 'company'}
          memberIds={memberIds}
          people={data.people}
          teams={data.teams}
        />
      ) : null}
      {view === 'organigrama' ? (
        <WorkerOrganization people={data.people} teams={data.teams} />
      ) : null}
      {view === 'funciones' ? <StaffFunctionsSection tenantId={tenantId} /> : null}
      {editingTeam && team ? (
        <WorkTeamForm
          key={team.id}
          tenantId={tenantId}
          team={team}
          people={data.people.map((item) => ({
            id: item.userId,
            label: item.fullName || item.email,
          }))}
          onCancel={() => setEditingTeam(false)}
          onSaved={async () => {
            await cache.invalidateQueries({ queryKey: workTeamsQuery(tenantId).queryKey })
            setEditingTeam(false)
          }}
        />
      ) : null}
    </div>
  )
}
