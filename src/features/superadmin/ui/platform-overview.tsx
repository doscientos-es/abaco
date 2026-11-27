import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  PageStack,
} from '@doscientos/ui'
import { ArrowUpRight, Buildings, Receipt, Wallet } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { formatEuros } from '@/shared/domain/money'

import { platformOverviewQuery, type PlatformOverview } from '../application/superadmin-queries'
import { companyFilters, type PlatformSearch } from '../domain/platform-navigation'
import { PlatformLoading, PlatformMessage, platformPanelClass } from './platform-ui'

const number = new Intl.NumberFormat('es-ES')
const month = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const shortcuts = [
  {
    title: 'Empresas y módulos',
    description: 'Acceso, planes y cuotas por empresa',
    icon: Buildings,
    search: {},
  },
  {
    title: 'Facturas',
    description: 'Emisión y envío de facturas de suscripción',
    icon: Receipt,
    search: { vista: 'facturas' },
  },
  {
    title: 'Planes y precios',
    description: 'Tarifas del catálogo público',
    icon: Wallet,
    search: { vista: 'planes' },
  },
] satisfies { title: string; description: string; icon: typeof Buildings; search: PlatformSearch }[]

export function PlatformOverviewPage({ userId }: { userId: string }) {
  const query = useQuery(platformOverviewQuery(userId))

  return (
    <PageStack>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Resumen de Menoslios</PageHeaderTitle>
          <PageHeaderDescription>
            Revisa clientes, suscripciones y cobros desde un solo sitio.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>
      <nav aria-label="Accesos directos">
        <ul className="grid gap-2 sm:grid-cols-3">
          {shortcuts.map(({ icon: Icon, search, title, description }) => (
            <li key={title} className="min-w-0">
              <Link
                to="/superadmin"
                search={search}
                className={`${platformPanelClass} hover:border-primary focus-visible:outline-ring flex h-full items-start gap-3 p-3 focus-visible:outline-2 focus-visible:outline-offset-2`}
              >
                <Icon aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="text-muted-foreground block text-xs">{description}</span>
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="text-muted-foreground size-4 shrink-0"
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {query.isPending ? (
        <div className={platformPanelClass}>
          <PlatformLoading>Cargando estadísticas…</PlatformLoading>
        </div>
      ) : query.isError ? (
        <div className={platformPanelClass}>
          <PlatformMessage
            title="No se pudieron cargar las estadísticas."
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <OverviewMetrics data={query.data} />
      )}
    </PageStack>
  )
}

function OverviewMetrics({ data }: { data: PlatformOverview }) {
  const total = companyFilters.reduce(
    (sum, { id }) => (id === 'archived' ? sum : sum + (data.companies[id] ?? 0)),
    0,
  )
  const peak = Math.max(1, ...data.collections.map(({ cents }) => cents))
  const currentMonth = data.collections.at(-1)
  const collected = data.collections.some(({ count }) => count > 0)

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <section
        aria-labelledby="platform-company-stats"
        className={`${platformPanelClass} space-y-3 p-4 sm:p-5`}
      >
        <div>
          <h2 id="platform-company-stats" className="font-semibold">
            Empresas por estado
          </h2>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{number.format(total)}</p>
          <p className="text-muted-foreground text-sm">
            Empresas no archivadas, incluidas las de cortesía.
          </p>
        </div>
        <ul className="divide-border divide-y">
          {companyFilters.map(({ id, label }) => (
            <li key={id}>
              <Link
                to="/superadmin"
                search={{ estado: id }}
                className="focus-visible:outline-ring hover:bg-muted/60 flex min-h-11 items-center justify-between gap-2 rounded-sm px-2 text-sm focus-visible:outline-2"
              >
                <span className={id === 'attention' ? 'font-semibold' : undefined}>{label}</span>
                <span className="flex items-center gap-2 font-semibold tabular-nums">
                  {number.format(data.companies[id] ?? 0)}
                  <ArrowUpRight aria-hidden="true" className="text-muted-foreground size-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section
        aria-labelledby="platform-collection-stats"
        className={`${platformPanelClass} space-y-3 p-4 sm:p-5`}
      >
        <div>
          <h2 id="platform-collection-stats" className="font-semibold">
            Cobros confirmados
          </h2>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {formatEuros(currentMonth?.cents ?? 0)}
          </p>
          <p className="text-muted-foreground text-sm">
            Este mes, IVA incluido. No incluye intentos pendientes ni fallidos.
          </p>
        </div>
        {!collected ? (
          <PlatformMessage title="Sin cobros confirmados en los últimos seis meses." />
        ) : (
          <ul aria-label="Importe cobrado por mes, últimos seis meses" className="space-y-2">
            {data.collections.map(({ month: period, cents, count }) => (
              <li key={period} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                  <span>{month.format(new Date(`${period}-01T00:00:00Z`))}</span>
                  <span className="font-medium tabular-nums">
                    {formatEuros(cents)}{' '}
                    <span className="text-muted-foreground text-xs">
                      · {number.format(count)} {count === 1 ? 'cobro' : 'cobros'}
                    </span>
                  </span>
                </div>
                <div aria-hidden="true" className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${(cents / peak) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
