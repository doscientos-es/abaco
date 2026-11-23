import {
  Badge,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  PageStack,
} from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { billingCatalogQuery, billingPreviewQuery, planLabel } from '@/features/billing'
import { ModuleSubscriptions } from '@/features/product-modules'
import { formatEuros } from '@/shared/domain/money'

import type { PlatformCompany } from '../application/superadmin-queries'
import {
  companyBackSearch,
  companySectionSearch,
  withoutEditor,
  type PlatformSearch,
} from '../domain/platform-navigation'
import { CompanyBillingAgreement } from './company-billing-agreement'
import { CompanyPayments } from './company-payments'
import { CompanyProfileSection } from './company-profile'
import { CompanyReferralSection } from './company-referral'
import { CompanyNavigation } from './platform-shell'
import {
  billingPeriodLabel,
  CompanyStatus,
  formatPlatformDate,
  PlatformBackLink,
  PlatformEditLink,
  PlatformLoading,
  PlatformMessage,
  PlatformRowLink,
  platformRowMetaClass,
  platformRowTitleClass,
} from './platform-ui'

export function CompanyBackLink({ search }: { search: PlatformSearch }) {
  const fromInvoices = search.origen === 'facturas'
  return (
    <PlatformBackLink search={companyBackSearch(search)}>
      {!fromInvoices
        ? 'Volver a empresas'
        : search.referencia
          ? 'Volver a la factura'
          : 'Volver a facturas'}
    </PlatformBackLink>
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
        <dl className="border-border bg-card mt-3 grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-4">
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
      {search.seccion === 'datos' ? (
        <>
          <CompanyProfileSection tenantId={company.id} search={search} />
          <CompanyReferralSection key={company.id} tenantId={company.id} />
        </>
      ) : search.seccion === 'modulos' ? (
        <CompanyModules company={company} search={search} />
      ) : search.seccion === 'pagos' ? (
        <CompanyPayments tenantId={company.id} rates={rates} />
      ) : (
        <section aria-labelledby="platform-subscription" className="space-y-3">
          <h2 id="platform-subscription" className="text-base font-semibold">
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
              key={search.edicion ?? 'detail'}
              tenantId={company.id}
              members={company.member_count}
              subscriptionStatus={company.subscription_status}
              search={search}
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

function CompanyModules({ company, search }: { company: PlatformCompany; search: PlatformSearch }) {
  const queryClient = useQueryClient()
  const previewOptions = billingPreviewQuery(company.id)
  const preview = useQuery({ ...previewOptions, enabled: !company.is_complimentary })
  const next = preview.data?.next

  return (
    <section aria-labelledby="platform-modules" className="space-y-3">
      <h2 id="platform-modules" className="text-base font-semibold">
        Módulos
      </h2>
      {search.modulo ? (
        <PlatformBackLink
          search={
            search.edicion === 'modulo'
              ? withoutEditor(search)
              : companySectionSearch(search, 'modulos')
          }
        >
          {search.edicion === 'modulo' ? 'Volver al módulo' : 'Volver a módulos'}
        </PlatformBackLink>
      ) : null}
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
          <PlatformLoading>Comprobando las condiciones de suscripción…</PlatformLoading>
        )
      ) : (
        <ModuleSubscriptions
          key={`${search.modulo ?? 'list'}:${search.edicion ?? 'detail'}`}
          tenantId={company.id}
          active={company.subscription_status === 'active'}
          plan={company.plan}
          nextPlan={next?.plan ?? null}
          courtesy={company.is_complimentary}
          canGift
          period={next?.period}
          blocked={
            !company.is_complimentary &&
            (preview.data?.pending ||
              preview.data?.cancel_at_period_end ||
              company.subscription_status === 'past_due')
          }
          onChanged={() => queryClient.invalidateQueries({ queryKey: previewOptions.queryKey })}
          navigation={
            search.modulo
              ? {
                  code: search.modulo,
                  editing: search.edicion === 'modulo',
                  editLink: (
                    <PlatformEditLink search={{ ...search, edicion: 'modulo' }}>
                      Editar módulo
                    </PlatformEditLink>
                  ),
                }
              : {
                  renderRow: ({ code, name, status, surcharge }) => (
                    <PlatformRowLink
                      search={{ ...search, modulo: code }}
                      aside={<span className="hidden text-xs sm:inline">{surcharge}</span>}
                    >
                      <span className={platformRowTitleClass}>{name}</span>
                      <span className={platformRowMetaClass}>
                        {status}
                        <span className="sm:hidden"> · {surcharge}</span>
                      </span>
                    </PlatformRowLink>
                  ),
                }
          }
        />
      )}
    </section>
  )
}
