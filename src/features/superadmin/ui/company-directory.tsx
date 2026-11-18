import {
  Badge,
  Button,
  Input,
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
import { Buildings, CaretRight, MagnifyingGlass } from '@phosphor-icons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import type { PlatformCompany } from '../application/superadmin-queries'
import { directorySearch, type PlatformSearch } from '../domain/platform-navigation'
import {
  billingPeriodLabel,
  CompanyStatus,
  formatPlatformDate,
  PlatformMessage,
  PlatformPagination,
  platformPlanLabel,
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
          <p className="text-primary mb-1 text-xs font-semibold">Administración de Ábaco</p>
          <PageHeaderTitle>Empresas</PageHeaderTitle>
          <PageHeaderDescription>
            Consulta suscripciones, configura módulos y revisa los cobros de cada empresa.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>
      <section
        aria-label="Directorio de empresas"
        className="border-border bg-card rounded-xl border"
      >
        <div className="border-border flex flex-wrap items-end justify-between gap-3 border-b px-4 py-4 sm:px-5">
          <CompanySearch
            key={q ?? ''}
            query={q ?? ''}
            onSearch={(value) => void navigate({ search: value ? { q: value } : {} })}
          />
          {q ? (
            <Link
              to="/superadmin"
              search={{}}
              className="text-primary focus-visible:outline-ring inline-flex min-h-10 items-center rounded-md text-sm font-medium hover:underline focus-visible:outline-2"
            >
              Limpiar búsqueda
            </Link>
          ) : null}
        </div>
        {loading ? (
          <output className="text-muted-foreground block p-5 text-sm">Cargando empresas…</output>
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

function CompanySearch({ query, onSearch }: { query: string; onSearch: (value: string) => void }) {
  const [draft, setDraft] = useState(query)
  return (
    <search className="w-full sm:w-auto">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          onSearch(draft.trim())
        }}
      >
        <div className="min-w-36 flex-1 sm:w-64">
          <label htmlFor="platform-search" className="mb-1.5 block text-sm font-medium">
            Buscar empresa
          </label>
          <Input
            id="platform-search"
            type="search"
            placeholder="Nombre de la empresa"
            maxLength={120}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          <MagnifyingGlass aria-hidden="true" /> Buscar
        </Button>
      </form>
    </search>
  )
}

function CompanyTable({
  companies,
  search,
}: {
  companies: PlatformCompany[]
  search: PlatformSearch
}) {
  return (
    <Table aria-label="Empresas de Ábaco">
      <TableHeader className="bg-muted/40">
        <TableRow>
          <TableHead scope="col" className="pl-4 sm:pl-5">
            Empresa
          </TableHead>
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
            <TableCell className="py-1 pl-4 whitespace-normal sm:pl-5">
              <Link
                to="/superadmin"
                search={{ ...directorySearch(search), empresa: company.id }}
                activeOptions={{ exact: true, includeSearch: true }}
                className="group focus-visible:outline-ring flex min-h-14 items-center gap-2 rounded-md py-2 focus-visible:outline-2 sm:gap-3"
              >
                <span className="bg-primary/10 text-primary hidden size-9 shrink-0 place-items-center rounded-lg sm:grid">
                  <Buildings aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="group-hover:text-primary block font-semibold break-words">
                    {company.name}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {company.member_count} {company.member_count === 1 ? 'persona' : 'personas'}
                    <span className="lg:hidden"> · {platformPlanLabel(company.plan)}</span>
                  </span>
                </span>
                <CaretRight
                  aria-hidden="true"
                  className="text-muted-foreground ml-auto size-4 shrink-0 sm:mr-2"
                />
              </Link>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-1">
                <CompanyStatus status={company.subscription_status} />
                {company.is_complimentary ? <Badge variant="outline">Cortesía</Badge> : null}
              </div>
            </TableCell>
            <TableCell className="hidden lg:table-cell">
              <p className="font-medium">{platformPlanLabel(company.plan)}</p>
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
