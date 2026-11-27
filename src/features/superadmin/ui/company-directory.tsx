import {
  Badge,
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
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'

import { billingCatalogQuery, planLabel } from '@/features/billing'

import type { PlatformCompany } from '../application/superadmin-queries'
import {
  companySectionSearch,
  companyFilters,
  directorySearch,
  type PlatformSearch,
} from '../domain/platform-navigation'
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

export function CompanyDirectory({
  companies,
  search,
  loading,
  hasMore,
  onRetry,
}: {
  companies: PlatformCompany[]
  search: PlatformSearch
  loading: boolean
  hasMore: boolean
  onRetry: (() => void) | undefined
}) {
  const q = search.q
  const page = search.page ?? 1
  const navigate = useNavigate({ from: '/superadmin' })
  return (
    <PageStack>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Empresas</PageHeaderTitle>
          <PageHeaderDescription>
            Encuentra un cliente y gestiona su plan, cuota, módulos y cobros.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>
      <nav aria-label="Filtrar empresas por estado">
        <ul className="flex flex-wrap gap-1.5">
          {[{ id: undefined, label: 'Todas' }, ...companyFilters].map(({ id, label }) => (
            <li key={label}>
              <Link
                to="/superadmin"
                search={{ ...(q && { q }), ...(id && { estado: id }) }}
                aria-current={search.estado === id ? 'page' : undefined}
                className={buttonVariants({
                  variant: search.estado === id ? 'secondary' : 'outline',
                  size: 'sm',
                })}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-label="Directorio de empresas" className={platformPanelClass}>
        <div className="border-border flex flex-wrap items-end gap-2 border-b p-3">
          <PlatformSearchForm
            query={q ?? ''}
            label="Buscar empresa"
            placeholder="Ej. Taller Norte"
            onSearch={(value) =>
              void navigate({
                search: {
                  ...(value && { q: value }),
                  ...(search.estado && { estado: search.estado }),
                },
              })
            }
          />
          {q || search.estado ? (
            <Link to="/superadmin" search={{}} className={platformTextActionClass}>
              Limpiar filtros
            </Link>
          ) : null}
        </div>
        {loading ? (
          <PlatformLoading>Cargando empresas…</PlatformLoading>
        ) : onRetry ? (
          <PlatformMessage title="No se pudieron cargar las empresas." onRetry={onRetry} />
        ) : (
          <>
            {companies.length ? (
              <CompanyTable companies={companies} search={search} />
            ) : (
              <PlatformMessage
                title={
                  page > 1
                    ? 'No hay más empresas'
                    : q || search.estado
                      ? 'No encontramos ninguna empresa'
                      : 'Aún no hay empresas'
                }
              >
                {page > 1
                  ? 'Vuelve a la página anterior.'
                  : q || search.estado
                    ? 'Prueba con otro nombre o limpia los filtros.'
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
    </PageStack>
  )
}

function CompanyTable({
  companies,
  search,
}: {
  companies: PlatformCompany[]
  search: PlatformSearch
}) {
  const { data: rates } = useQuery(billingCatalogQuery)
  return (
    <Table aria-label="Empresas de Ábaco" density="compact">
      <TableHeader className="bg-muted/40">
        <TableRow>
          <TableHead scope="col">Empresa</TableHead>
          <TableHead scope="col">Estado</TableHead>
          <TableHead scope="col" className="hidden lg:table-cell">
            Plan
          </TableHead>
          <TableHead scope="col" className="hidden lg:table-cell">
            Fin del periodo
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {companies.map((company) => (
          <TableRow key={company.id}>
            <TableCell className="w-3/5 min-w-0 whitespace-normal lg:w-auto">
              <PlatformRecordLink search={{ ...directorySearch(search), empresa: company.id }}>
                {company.name}
              </PlatformRecordLink>
              <p className="text-muted-foreground text-xs">
                {company.member_count} {company.member_count === 1 ? 'persona' : 'personas'}
                <span className="lg:hidden"> · {planLabel(company.plan, rates)}</span>
              </p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <Link
                  to="/superadmin"
                  search={companySectionSearch(
                    { ...directorySearch(search), empresa: company.id },
                    'datos',
                  )}
                  aria-label={`Ver ficha de ${company.name}`}
                  className="text-primary focus-visible:outline-ring inline-flex min-h-8 items-center rounded-sm underline underline-offset-2 focus-visible:outline-2"
                >
                  Ver ficha
                </Link>
                <Link
                  to="/superadmin"
                  search={{ ...directorySearch(search), empresa: company.id }}
                  aria-label={`Ver suscripción y precio de ${company.name}`}
                  className="text-primary focus-visible:outline-ring inline-flex min-h-8 items-center rounded-sm underline underline-offset-2 focus-visible:outline-2"
                >
                  Suscripción y precio
                </Link>
                <Link
                  to="/superadmin"
                  search={companySectionSearch(
                    { ...directorySearch(search), empresa: company.id },
                    'modulos',
                  )}
                  aria-label={`Ver módulos de ${company.name}`}
                  className="text-primary focus-visible:outline-ring inline-flex min-h-8 items-center rounded-sm underline underline-offset-2 focus-visible:outline-2"
                >
                  Módulos
                </Link>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-1">
                {company.is_complimentary ? (
                  <Badge variant="outline">Cortesía</Badge>
                ) : company.billing_bucket === 'attention' &&
                  company.subscription_status === 'active' ? (
                  <Badge variant="warning">Renovación vencida</Badge>
                ) : (
                  <CompanyStatus status={company.subscription_status} />
                )}
              </div>
            </TableCell>
            <TableCell className="hidden lg:table-cell">
              <p className="font-medium">{planLabel(company.plan, rates)}</p>
              <p className="text-muted-foreground text-xs">
                {billingPeriodLabel(company.billing_interval)}
              </p>
            </TableCell>
            <TableCell className="text-muted-foreground hidden lg:table-cell">
              {formatPlatformDate(company.current_period_end)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
