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
} from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'

import { billingCatalogQuery, planLabel } from '@/features/billing'

import type { PlatformCompany } from '../application/superadmin-queries'
import { directorySearch, type PlatformSearch } from '../domain/platform-navigation'
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
  onRetry,
}: {
  companies: PlatformCompany[]
  search: PlatformSearch
  loading: boolean
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
            Consulta suscripciones, configura módulos y revisa los cobros de cada empresa.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>
      <section aria-label="Directorio de empresas" className={platformPanelClass}>
        <div className="border-border flex flex-wrap items-end gap-2 border-b p-3">
          <PlatformSearchForm
            query={q ?? ''}
            label="Buscar empresa"
            placeholder="Ej. Taller Norte"
            onSearch={(value) => void navigate({ search: value ? { q: value } : {} })}
          />
          {q ? (
            <Link to="/superadmin" search={{}} className={platformTextActionClass}>
              Limpiar búsqueda
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
                    : q
                      ? 'No encontramos ninguna empresa'
                      : 'Aún no hay empresas'
                }
              >
                {page > 1
                  ? 'Vuelve a la página anterior.'
                  : q
                    ? 'Prueba con otro nombre o limpia la búsqueda.'
                    : null}
              </PlatformMessage>
            )}
            <PlatformPagination
              page={page}
              count={companies.length}
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
            <TableCell className="whitespace-normal">
              <PlatformRecordLink search={{ ...directorySearch(search), empresa: company.id }}>
                {company.name}
              </PlatformRecordLink>
              <p className="text-muted-foreground text-xs">
                {company.member_count} {company.member_count === 1 ? 'persona' : 'personas'}
                <span className="lg:hidden"> · {planLabel(company.plan, rates)}</span>
              </p>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-1">
                <CompanyStatus status={company.subscription_status} />
                {company.is_complimentary ? <Badge variant="outline">Cortesía</Badge> : null}
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
