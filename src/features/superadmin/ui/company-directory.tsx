import {
  Badge,
  ConfirmDialog,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  PageStack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonVariants,
} from '@doscientos/ui'
import { Buildings } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { billingCatalogQuery, planLabel } from '@/features/billing'
import { useActionLock } from '@/shared/lib/use-action-lock'

import {
  applyPlatformCompanyAction,
  type CompanyCounts,
  type PlatformCompany,
  type PlatformCompanyAction,
} from '../application/superadmin-queries'
import {
  companyFilters,
  companyPeriods,
  companySorts,
  directorySearch,
  platformPageSize,
  type PlatformSearch,
} from '../domain/platform-navigation'
import { CompanyDirectoryMenu } from './company-directory-menu'
import { PlatformField, PlatformSelect } from './platform-form-field'
import {
  billingPeriodLabel,
  CompanyStatus,
  formatPlatformDate,
  PlatformLoading,
  PlatformMessage,
  platformPanelClass,
  PlatformPagination,
  PlatformRecordLink,
  PlatformSearchForm,
  platformTextActionClass,
} from './platform-ui'

const number = new Intl.NumberFormat('es-ES')
const allFilters = [{ id: undefined, label: 'Todas' }, ...companyFilters] as const
const actionLabels = {
  pause: 'Pausar renovación',
  resume: 'Reanudar renovación',
  archive: 'Archivar empresa',
  restore: 'Restaurar empresa',
} as const

const actionConfirm = {
  pause:
    'No habrá renovación ni reintentos automáticos. Si hay un periodo pagado vigente, la empresa podrá seguir usando Menos Líos hasta que termine. No se cobra nada al confirmar.',
  resume:
    'Se volverá a intentar el cobro automáticamente cuando termine el periodo actual, si la tarjeta sigue disponible. No se hace ningún cobro ahora.',
  archive:
    'Oculta la empresa del listado principal sin borrar datos ni facturas. No bloquea su acceso ni una futura contratación; si reactiva la renovación, volverá a aparecer para revisión. Puedes restaurarla desde Archivadas.',
  restore:
    'Volverá a aparecer en el listado principal. No se reanuda la renovación ni se hace ningún cobro.',
} as const

const actionResult = {
  pause: 'Renovación pausada.',
  resume: 'Renovación automática reanudada.',
  archive: 'Empresa archivada. Sus datos y facturas se conservan.',
  restore: 'Empresa restaurada.',
} as const

type ActionRequest = { company: PlatformCompany; action: PlatformCompanyAction }

export function CompanyDirectory({
  companies,
  search,
  loading,
  hasMore,
  counts,
  total,
  onRetry,
}: {
  companies: PlatformCompany[]
  search: PlatformSearch
  loading: boolean
  hasMore: boolean
  counts: CompanyCounts | undefined
  total: number | undefined
  onRetry: (() => void) | undefined
}) {
  const q = search.q
  const page = search.page ?? 1
  const navigate = useNavigate({ from: '/superadmin' })
  const queryClient = useQueryClient()
  const results = useRef<HTMLHeadingElement>(null)
  const actionLock = useActionLock()
  const [target, setTarget] = useState<ActionRequest | null>(null)
  const [notice, setNotice] = useState('')
  const clearable = Boolean(q || search.estado || search.periodo || search.orden)
  const mutation = useMutation({
    mutationFn: ({ company, action }: ActionRequest) => applyPlatformCompanyAction(company, action),
    onSettled: async (_data, error, { company, action }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform-companies'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['billing-preview', company.id] }),
        queryClient.invalidateQueries({ queryKey: ['platform-company', company.id] }),
      ])
      if (!error) {
        setTarget(null)
        setNotice(actionResult[action])
        requestAnimationFrame(() => results.current?.focus())
      }
      actionLock.release()
    },
  })
  const updateFilters = (
    updates: Partial<Record<'q' | 'estado' | 'periodo' | 'orden', string | undefined>>,
  ) =>
    void navigate({
      search: parseCompanyUpdates(search, updates),
    })
  const countFor = (id: PlatformSearch['estado']) =>
    id
      ? (counts?.[id] ?? 0)
      : companyFilters.reduce(
          (sum, filter) => sum + (filter.id === 'archived' ? 0 : (counts?.[filter.id] ?? 0)),
          0,
        )

  return (
    <PageStack>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Empresas</PageHeaderTitle>
          <PageHeaderDescription>
            Gestiona suscripciones, renovaciones y facturas de las empresas de Menoslios.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>
      <section
        className={`${platformPanelClass} space-y-3 p-3 sm:p-4`}
        aria-label="Filtros del directorio"
      >
        <div className="flex flex-wrap items-end gap-3">
          <PlatformSearchForm
            query={q ?? ''}
            label="Buscar empresa"
            placeholder="Nombre o identificador"
            onSearch={(value) => updateFilters({ q: value || undefined })}
          />
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:flex-none">
            <PlatformField label="Periodicidad" className="min-w-0">
              {(control) => (
                <PlatformSelect
                  {...control}
                  value={search.periodo ?? 'all'}
                  options={[
                    { id: 'all', label: 'Cualquier periodo' },
                    { id: 'month', label: 'Mensual' },
                    { id: 'year', label: 'Anual' },
                    { id: 'none', label: 'Sin periodo' },
                  ]}
                  onChange={(value) => updateFilters({ periodo: value })}
                />
              )}
            </PlatformField>
            <PlatformField label="Ordenar por" className="min-w-0">
              {(control) => (
                <PlatformSelect
                  {...control}
                  value={search.orden ?? 'name'}
                  options={[
                    { id: 'name', label: 'Nombre (A–Z)' },
                    { id: 'newest', label: 'Alta más reciente' },
                    { id: 'renewal', label: 'Fin de periodo más próximo' },
                  ]}
                  onChange={(value) => updateFilters({ orden: value })}
                />
              )}
            </PlatformField>
          </div>
          {clearable ? (
            <Link to="/superadmin" search={{}} className={platformTextActionClass}>
              Limpiar filtros
            </Link>
          ) : null}
        </div>
        <nav aria-label="Filtrar empresas por estado">
          <ul className="flex flex-wrap gap-2">
            {allFilters.map(({ id, label }) => (
              <li key={label}>
                <Link
                  to="/superadmin"
                  search={parseCompanyUpdates(search, { estado: id })}
                  aria-current={search.estado === id ? 'page' : undefined}
                  className={`${buttonVariants({ variant: search.estado === id ? 'secondary' : 'outline', size: 'sm' })} min-h-9 gap-1.5`}
                >
                  {label}
                  {counts ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {number.format(countFor(id))}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>
      <output aria-live="polite" className={notice ? 'text-sm font-medium' : 'sr-only'}>
        {notice}
      </output>
      <section aria-labelledby="company-directory-results" className={platformPanelClass}>
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b p-3 sm:px-4">
          <h2
            id="company-directory-results"
            ref={results}
            tabIndex={-1}
            className="flex items-center gap-2 text-sm font-semibold focus-visible:outline-offset-4"
          >
            <Buildings aria-hidden="true" className="size-4" />
            Directorio de empresas
          </h2>
          {total !== undefined ? (
            <output className="text-muted-foreground text-xs tabular-nums">
              {!companies.length
                ? `${number.format(total)} ${total === 1 ? 'empresa' : 'empresas'}`
                : `${number.format((page - 1) * platformPageSize + 1)}–${number.format((page - 1) * platformPageSize + companies.length)} de ${number.format(total)} ${total === 1 ? 'empresa' : 'empresas'}`}
            </output>
          ) : null}
        </div>
        {loading ? (
          <PlatformLoading>Cargando empresas…</PlatformLoading>
        ) : onRetry ? (
          <PlatformMessage title="No se pudieron cargar las empresas." onRetry={onRetry} />
        ) : (
          <>
            {companies.length ? (
              <CompanyTable
                companies={companies}
                search={search}
                onAction={(company, action) => {
                  setNotice('')
                  mutation.reset()
                  setTarget({ company, action })
                }}
              />
            ) : (
              <PlatformMessage
                title={
                  page > 1
                    ? 'No hay más empresas'
                    : search.estado === 'archived' && !q && !search.periodo
                      ? 'No hay empresas archivadas'
                      : clearable
                        ? 'No encontramos ninguna empresa'
                        : 'Aún no hay empresas'
                }
              >
                {page > 1
                  ? 'Vuelve a la página anterior.'
                  : clearable
                    ? 'Prueba otro nombre o cambia los filtros.'
                    : null}
              </PlatformMessage>
            )}
            <PlatformPagination
              page={page}
              count={companies.length}
              hasMore={hasMore}
              onChange={(nextPage) =>
                void navigate({ search: directorySearch({ ...search, page: nextPage }) })
              }
            />
          </>
        )}
      </section>
      {target ? (
        <ConfirmDialog
          open
          title={actionLabels[target.action]}
          description={
            <span className="space-y-2">
              <span className="block">
                «{target.company.name}». {actionConfirm[target.action]}
              </span>
              {mutation.error ? (
                <span role="alert" className="text-destructive block">
                  {mutation.error.message}
                </span>
              ) : null}
            </span>
          }
          confirmLabel={actionLabels[target.action]}
          pending={mutation.isPending}
          destructive={target.action === 'archive'}
          onOpenChange={(open) => {
            if (!open && !mutation.isPending) setTarget(null)
          }}
          onConfirm={() => {
            if (!mutation.isPending && actionLock.acquire()) mutation.mutate(target)
          }}
        />
      ) : null}
    </PageStack>
  )
}

function parseCompanyUpdates(
  search: PlatformSearch,
  updates: Partial<Record<'q' | 'estado' | 'periodo' | 'orden', string | undefined>>,
): PlatformSearch {
  const q = 'q' in updates ? updates.q : search.q
  const estado =
    'estado' in updates ? companyFilters.find(({ id }) => id === updates.estado)?.id : search.estado
  const periodo =
    'periodo' in updates ? companyPeriods.find((id) => id === updates.periodo) : search.periodo
  const orden =
    'orden' in updates
      ? companySorts.find((id) => id === updates.orden && id !== 'name')
      : search.orden
  return {
    ...(q && { q }),
    ...(estado && { estado }),
    ...(periodo && { periodo }),
    ...(orden && { orden }),
  }
}

function CompanyDirectoryStatus({ company }: { company: PlatformCompany }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {company.is_complimentary ? (
        <Badge variant="outline">Cortesía</Badge>
      ) : company.billing_bucket === 'attention' &&
        !company.archived_at &&
        company.subscription_status === 'active' ? (
        <Badge variant="warning">Renovación vencida</Badge>
      ) : (
        <CompanyStatus status={company.subscription_status} />
      )}
      {company.cancel_at_period_end &&
      ['active', 'past_due'].includes(company.subscription_status) &&
      !company.is_complimentary ? (
        <Badge variant="warning" icon={false}>
          No renueva
        </Badge>
      ) : null}
      {company.archived_at ? <Badge variant="outline">Archivada</Badge> : null}
      {company.archived_at && company.billing_bucket === 'attention' ? (
        <Badge variant="warning">Renovación reactivada</Badge>
      ) : null}
      {company.has_pending_payment ? <Badge variant="info">Pago en curso</Badge> : null}
    </div>
  )
}

function CompanyTable({
  companies,
  search,
  onAction,
}: {
  companies: PlatformCompany[]
  search: PlatformSearch
  onAction: (company: PlatformCompany, action: PlatformCompanyAction) => void
}) {
  const { data: rates } = useQuery(billingCatalogQuery)
  return (
    <Table aria-label="Empresas de Menos Líos" density="compact">
      <TableHeader className="bg-muted/40">
        <TableRow>
          <TableHead scope="col">Empresa</TableHead>
          <TableHead scope="col" className="hidden lg:table-cell">
            Estado
          </TableHead>
          <TableHead scope="col" className="hidden lg:table-cell">
            Plan
          </TableHead>
          <TableHead scope="col" className="hidden lg:table-cell">
            Personas
          </TableHead>
          <TableHead scope="col" className="hidden lg:table-cell">
            Fin del periodo
          </TableHead>
          <TableHead scope="col" className="text-right">
            <span className="sr-only lg:not-sr-only">Acciones</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {companies.map((company) => {
          const plan = planLabel(company.plan, rates)
          const period = billingPeriodLabel(company.billing_interval)
          const members = number.format(company.member_count)
          const ends = formatPlatformDate(company.current_period_end)
          return (
            <TableRow key={company.id} className="align-top">
              <TableCell className="min-w-0 py-3 whitespace-normal">
                <PlatformRecordLink search={{ ...directorySearch(search), empresa: company.id }}>
                  {company.name}
                </PlatformRecordLink>
                <p className="text-muted-foreground mt-0.5 hidden text-xs lg:block">
                  Alta: {formatPlatformDate(company.created_at ?? null)}
                </p>
                <div className="mt-2 space-y-1.5 lg:hidden">
                  <CompanyDirectoryStatus company={company} />
                  <p className="text-muted-foreground text-xs">
                    {plan} · {period} · {members}{' '}
                    {company.member_count === 1 ? 'persona' : 'personas'}
                  </p>
                  {company.current_period_end ? (
                    <p className="text-muted-foreground text-xs">Fin de periodo: {ends}</p>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="hidden py-3 whitespace-normal lg:table-cell">
                <CompanyDirectoryStatus company={company} />
              </TableCell>
              <TableCell className="hidden py-3 whitespace-normal lg:table-cell">
                <p className="font-medium">{plan}</p>
                <p className="text-muted-foreground text-xs">{period}</p>
              </TableCell>
              <TableCell className="text-muted-foreground hidden py-3 tabular-nums lg:table-cell">
                {members}
              </TableCell>
              <TableCell className="text-muted-foreground hidden py-3 lg:table-cell">
                {ends}
              </TableCell>
              <TableCell className="w-14 py-2 text-right">
                <CompanyDirectoryMenu
                  company={company}
                  search={search}
                  onAction={(action) => onAction(company, action)}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
