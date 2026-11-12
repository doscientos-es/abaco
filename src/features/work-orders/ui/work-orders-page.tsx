import {
  Button,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@doscientos/ui'
import { ClipboardTextIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'

import { can, useSession } from '@/features/auth'
import { AgendaPage, ReportReviewInbox, ReportReviewTabLabel } from '@/features/visits'
import { workTeamLabel, workTeamsQuery } from '@/features/work-teams'
import { useTenantData } from '@/shared/store/store'
import { SelectField } from '@/shared/ui/form'
import { EmptyPanel } from '@/shared/ui/page-states'

import { listWorkOrders } from '../application/work-order-actions'
import { workTabs, type WorkSearch, type WorkTab } from '../domain/work-search'
import { WorkOrdersList } from './work-orders-list'
import { workStatusLabels } from './work-status-badge'

export function WorkOrdersPage() {
  const { tenant } = useTenantData()
  const session = useSession()
  const search = useSearch({ from: '/trabajos' })
  const navigate = useNavigate({ from: '/trabajos' })
  const tabs = workTabs.filter(
    (tab) => tab !== 'contratados' && (tab !== 'revision' || session?.role === 'admin'),
  )
  const tab = search.tab && tabs.includes(search.tab) ? search.tab : 'planificacion'
  const labels: Record<WorkTab, string> = {
    planificacion: 'Planificación',
    revision: 'Partes por revisar',
    contratados: 'Trabajos contratados',
    anteriores: 'Trabajos anteriores',
  }
  return (
    <div className="space-y-5">
      <PageHeader className="py-0">
        <PageHeaderHeading>
          <PageHeaderTitle className="text-xl md:text-2xl">Planificación</PageHeaderTitle>
          <PageHeaderDescription>
            Organiza conjuntamente las visitas de contratos y las visitas independientes.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>
      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) =>
          void navigate({
            to: '/trabajos',
            search: (previous) => ({ ...previous, tab: key as WorkTab }),
          })
        }
      >
        <TabsList
          aria-label="Secciones de planificación"
          className="w-full overflow-x-auto sm:w-fit"
        >
          {tabs.map((id) => (
            <TabsTrigger key={id} id={id}>
              {id === 'revision' ? <ReportReviewTabLabel tenantId={tenant.id} /> : labels[id]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent id={tab} key={tab}>
          {tab === 'planificacion' ? <AgendaPage /> : null}
          {tab === 'revision' && session?.role === 'admin' ? (
            <ReportReviewInbox tenantId={tenant.id} />
          ) : null}
          {tab === 'anteriores' ? <LegacyWorkOrdersPage /> : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function LegacyWorkOrdersPage() {
  const { tenant, clients } = useTenantData()
  const session = useSession()
  const search = useSearch({ from: '/trabajos' })
  const navigate = useNavigate({ from: '/trabajos' })
  const page = search.pagina ?? 0
  const legacyFilters = { equipo: search.equipo, estado: search.estado }
  const teams = useQuery(workTeamsQuery(tenant.id))
  const orders = useQuery({
    queryKey: ['work-orders', tenant.id, page, legacyFilters],
    queryFn: () => listWorkOrders(tenant.id, page, 20, legacyFilters),
  })
  const teamLabelById = new Map((teams.data ?? []).map((team) => [team.id, workTeamLabel(team)]))
  const clientById = new Map(clients.map((client) => [client.id, client.name]))
  const filtered = Boolean(search.equipo || search.estado)
  const setSearch = (next: WorkSearch) =>
    void navigate({
      to: '/trabajos',
      search: (previous) => ({
        ...previous,
        equipo: next.equipo,
        estado: next.estado,
        pagina: next.pagina,
      }),
    })

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Trabajos anteriores</PageHeaderTitle>
          <PageHeaderDescription>
            Consulta y termina los registros del modelo anterior, estén o no vinculados a un
            contrato.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>
      <section aria-label="Filtros de trabajos" className="space-y-2">
        <div className="grid gap-2 sm:max-w-2xl sm:grid-cols-2">
          <SelectField
            label="Equipo de trabajo"
            isDisabled={teams.isPending || teams.isError}
            value={search.equipo ?? ''}
            options={[
              { value: '', label: 'Todos los equipos' },
              { value: 'unassigned', label: 'Sin equipo asignado' },
              ...(teams.data ?? []).map((team) => ({
                value: team.id,
                label: workTeamLabel(team),
              })),
            ]}
            onChange={(value) =>
              setSearch({ ...search, equipo: value || undefined, pagina: undefined })
            }
          />
          <SelectField
            label="Estado"
            value={search.estado ?? ''}
            options={[
              { value: '', label: 'Todos los estados' },
              ...Object.entries(workStatusLabels).map(([value, label]) => ({ value, label })),
            ]}
            onChange={(value) =>
              setSearch({
                ...search,
                estado: (value || undefined) as WorkSearch['estado'],
                pagina: undefined,
              })
            }
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <output aria-live="polite" className="text-muted-foreground">
            {orders.isError
              ? 'No se pudo actualizar el listado'
              : orders.data
                ? `${orders.data.count} trabajos${filtered ? ' con estos filtros' : ''}`
                : 'Cargando trabajos…'}
          </output>
          {filtered ? (
            <Button variant="ghost" onPress={() => setSearch({})}>
              Limpiar filtros
            </Button>
          ) : null}
          {can(session?.role, 'team:manage') ? (
            <Link to="/ajustes" search={{ tab: 'equipo' }} className="text-primary underline">
              Gestionar equipos
            </Link>
          ) : null}
        </div>
        {teams.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
            <p className="text-destructive">{teams.error.message}</p>
            <Button variant="outline" onPress={() => void teams.refetch()}>
              Reintentar equipos
            </Button>
          </div>
        ) : null}
      </section>
      {orders.isPending ? (
        <div aria-busy="true" className="space-y-2">
          <output className="sr-only">Cargando trabajos…</output>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : null}
      {orders.isError ? (
        <div role="alert" className="border-destructive rounded-lg border p-4 text-sm">
          No se pudieron cargar los trabajos: {orders.error.message}
          <Button variant="outline" className="ml-3" onPress={() => void orders.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {orders.isSuccess && orders.data.items.length === 0 ? (
        <EmptyPanel
          icon={<ClipboardTextIcon />}
          title={
            page > 0
              ? 'No hay trabajos en esta página'
              : filtered
                ? 'Sin trabajos con estos filtros'
                : 'No hay trabajos anteriores'
          }
          description={
            page > 0
              ? 'El listado ha cambiado. Vuelve al inicio para ver los trabajos disponibles.'
              : filtered
                ? 'Prueba otro equipo o estado, o limpia los filtros para ver todos los trabajos.'
                : 'Aquí encontrarás los trabajos del modelo anterior, incluidos los que no pertenecen a un contrato.'
          }
        >
          {page > 0 ? (
            <Button variant="outline" onPress={() => setSearch({ ...search, pagina: undefined })}>
              Volver a la primera página
            </Button>
          ) : filtered ? (
            <Button variant="outline" onPress={() => setSearch({})}>
              Limpiar filtros
            </Button>
          ) : null}
          {!filtered && page === 0 ? (
            <Link to="/presupuestos" className="text-primary text-sm underline">
              Ver presupuestos
            </Link>
          ) : null}
        </EmptyPanel>
      ) : null}
      {orders.data?.items.length ? (
        <WorkOrdersList
          orders={orders.data.items}
          clients={clientById}
          teams={teamLabelById}
          teamsLoading={teams.isPending}
          teamsError={teams.isError}
        />
      ) : null}
      {orders.data && (page > 0 || orders.data.count > orders.data.pageSize) ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Página {page + 1}
            {orders.data.count > 0
              ? ` de ${Math.max(page + 1, Math.ceil(orders.data.count / orders.data.pageSize))}`
              : ''}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              isDisabled={page === 0}
              onPress={() => setSearch({ ...search, pagina: page - 1 })}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              isDisabled={(page + 1) * orders.data.pageSize >= orders.data.count}
              onPress={() => setSearch({ ...search, pagina: page + 1 })}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
