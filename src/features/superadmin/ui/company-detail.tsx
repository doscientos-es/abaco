import {
  Badge,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  PageStack,
} from '@doscientos/ui'
import { ArrowLeft } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { billingCatalogQuery, billingPreviewQuery, planLabel } from '@/features/billing'
import { ModuleSubscriptions } from '@/features/product-modules'
import { formatEuros } from '@/shared/domain/money'

import type { PlatformCompany } from '../application/superadmin-queries'
import {
  directorySearch,
  invoiceNavigation,
  type PlatformSearch,
} from '../domain/platform-navigation'
import { CompanyBillingAgreement } from './company-billing-agreement'
import { CompanyPayments } from './company-payments'
import { CompanyNavigation } from './platform-shell'
import {
  billingPeriodLabel,
  CompanyStatus,
  formatPlatformDate,
  PlatformMessage,
} from './platform-ui'

export function CompanyBackLink({ search }: { search: PlatformSearch }) {
  const fromInvoices = search.origen === 'facturas'
  return (
    <Link
      to="/superadmin"
      search={fromInvoices ? invoiceNavigation(search) : directorySearch(search)}
      activeOptions={{ exact: true, includeSearch: true }}
      className="text-primary focus-visible:outline-ring inline-flex min-h-10 w-fit items-center gap-2 rounded-md text-sm font-medium hover:underline focus-visible:outline-2"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {fromInvoices ? 'Volver a facturas' : 'Volver a empresas'}
    </Link>
  )
}

export function CompanyDetail({
  company,
  search,
}: {
  company: PlatformCompany
  search: PlatformSearch
}) {
  const { data: rates } = useQuery(billingCatalogQuery)
  return (
    <PageStack>
      <div>
        <CompanyBackLink search={search} />
        <PageHeader>
          <PageHeaderHeading>
            <PageHeaderTitle className="break-words whitespace-normal">
              {company.name}
            </PageHeaderTitle>
            <PageHeaderDescription>
              Gestiona el acceso y la facturación de esta empresa.
            </PageHeaderDescription>
          </PageHeaderHeading>
          <div className="flex flex-wrap items-center gap-2">
            <CompanyStatus status={company.subscription_status} />
            {company.is_complimentary ? <Badge variant="outline">Cortesía</Badge> : null}
          </div>
        </PageHeader>
        <dl className="border-border bg-card grid grid-cols-2 gap-4 rounded-xl border p-4 text-sm sm:grid-cols-4">
          <CompanyFact label="Plan" value={planLabel(company.plan, rates)} />
          <CompanyFact label="Personas" value={company.member_count} />
          <CompanyFact label="Periodicidad" value={billingPeriodLabel(company.billing_interval)} />
          <CompanyFact
            label="Fin del periodo"
            value={formatPlatformDate(company.current_period_end)}
          />
        </dl>
      </div>
      <nav aria-label="Secciones de la empresa">
        <CompanyNavigation search={search} />
      </nav>
      {search.seccion === 'modulos' ? (
        <CompanyModules company={company} />
      ) : search.seccion === 'pagos' ? (
        <CompanyPayments tenantId={company.id} rates={rates} />
      ) : (
        <section aria-labelledby="platform-subscription" className="space-y-3">
          <h2 id="platform-subscription" className="text-lg font-semibold">
            Suscripción
          </h2>
          {company.is_complimentary ? (
            <div className="border-border bg-card rounded-lg border">
              <PlatformMessage title="Suscripción de cortesía">
                Esta empresa no tiene cuotas de suscripción.
              </PlatformMessage>
            </div>
          ) : (
            <CompanyBillingAgreement
              tenantId={company.id}
              members={company.member_count}
              subscriptionStatus={company.subscription_status}
            />
          )}
        </section>
      )}
    </PageStack>
  )
}

function CompanyFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  )
}

function CompanyModules({ company }: { company: PlatformCompany }) {
  const queryClient = useQueryClient()
  const previewOptions = billingPreviewQuery(company.id)
  const preview = useQuery({ ...previewOptions, enabled: !company.is_complimentary })
  const next = preview.data?.next

  return (
    <section aria-labelledby="platform-modules" className="space-y-3">
      <h2 id="platform-modules" className="text-lg font-semibold">
        Módulos
      </h2>
      {!company.is_complimentary && !preview.isError && next ? (
        <p className="text-muted-foreground text-sm">
          Módulos en el próximo cobro u oferta: {formatEuros(next.module_net_cents ?? 0)} sin IVA /{' '}
          {next.period === 'year' ? 'año' : 'mes'}.
        </p>
      ) : null}
      {!company.is_complimentary && (!preview.data || preview.isError) ? (
        preview.isError ? (
          <PlatformMessage
            title="No se pudieron comprobar las condiciones para cambiar módulos."
            onRetry={() => void preview.refetch()}
          />
        ) : (
          <output className="text-muted-foreground block text-sm">
            Comprobando las condiciones de suscripción…
          </output>
        )
      ) : (
        <ModuleSubscriptions
          tenantId={company.id}
          active={company.subscription_status === 'active'}
          courtesy={company.is_complimentary}
          period={next?.period}
          blocked={
            !company.is_complimentary &&
            (preview.data?.pending ||
              preview.data?.cancel_at_period_end ||
              company.subscription_status === 'past_due')
          }
          onChanged={() => queryClient.invalidateQueries({ queryKey: previewOptions.queryKey })}
        />
      )}
    </section>
  )
}
