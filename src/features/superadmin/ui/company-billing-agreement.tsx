import { Alert, AlertTitle, Button, FieldLegend, FieldSet, Input } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import {
  billingCatalogQuery,
  billingPreviewQuery,
  billingVatLabel,
  catalogRateForCapacity,
  catalogQuote,
  MAX_SCALE_PLAN_MEMBERS,
  planLabel,
  SCALE_PLAN_MIN_MEMBERS,
  smallestRateFor,
  subscriptionQuery,
  type BillingTerms,
  type CatalogRate,
  type Interval,
} from '@/features/billing'
import {
  moduleNetForPlan,
  moduleSubscriptionsQuery,
  type ModuleSubscription,
} from '@/features/product-modules'
import { applyRate, centsToInput, formatEuros, parseEuros } from '@/shared/domain/money'

import {
  restoreBillingCatalog,
  scheduleBillingAgreement,
  type BillingAgreement,
} from '../application/superadmin-queries'
import { withoutEditor, type PlatformSearch } from '../domain/platform-navigation'
import { CompanyBillingVat } from './company-billing-vat'
import { PlatformField, PlatformSelect } from './platform-form-field'
import {
  PlatformBackLink,
  PlatformEditLink,
  PlatformFeedback,
  PlatformLoading,
  PlatformMessage,
} from './platform-ui'

const periodUnit = (period: Interval) => (period === 'year' ? 'año' : 'mes')

export function CompanyBillingAgreement({
  tenantId,
  members,
  subscriptionStatus,
  search,
}: {
  tenantId: string
  members: number
  subscriptionStatus: string
  search: PlatformSearch
}) {
  const catalog = useQuery(billingCatalogQuery)
  const previewOptions = billingPreviewQuery(tenantId)
  const preview = useQuery(previewOptions)
  const moduleSubscriptions = useQuery(moduleSubscriptionsQuery(tenantId))
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (agreement: BillingAgreement | { restoreCatalog: number }) =>
      'restoreCatalog' in agreement
        ? restoreBillingCatalog(tenantId, agreement.restoreCatalog)
        : scheduleBillingAgreement(tenantId, agreement),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: previewOptions.queryKey }),
        queryClient.invalidateQueries({ queryKey: subscriptionQuery(tenantId).queryKey }),
      ]),
    onError: (_error, agreement) => {
      if ('restoreCatalog' in agreement) {
        void queryClient.invalidateQueries({ queryKey: billingCatalogQuery.queryKey })
        void queryClient.invalidateQueries({ queryKey: previewOptions.queryKey })
      }
    },
  })
  const next = preview.data?.next ?? null
  const fixedNet = preview.data?.fixed_net_cents ?? null
  const editing = search.edicion
  const vatBlocked = preview.data?.pending || subscriptionStatus === 'past_due'
  const catalogRate =
    next && catalog.data ? catalogRateForCapacity(catalog.data, next.plan, next.seats) : null
  const catalogNet = next && catalogRate ? catalogQuote(catalogRate, next.period).net_cents : null
  const blocked = preview.data?.cancel_at_period_end
    ? 'Retira la cancelación antes de cambiar las condiciones.'
    : vatBlocked
      ? 'Resuelve el pago pendiente antes de cambiar las condiciones.'
      : null
  const blockMessage =
    editing === 'iva'
      ? vatBlocked && 'Resuelve el pago pendiente antes de cambiar el IVA.'
      : blocked

  return (
    <div className="border-border bg-card space-y-3 rounded-lg border p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {editing === 'cuota'
              ? 'Editar cuota'
              : editing === 'iva'
                ? 'Editar IVA'
                : 'Condiciones de facturación'}
          </h3>
          <p className="text-muted-foreground text-sm">
            Los cambios se aplican al próximo cobro u oferta, sin cargo inmediato.
          </p>
        </div>
        {editing ? (
          <PlatformBackLink search={withoutEditor(search)}>Volver a suscripción</PlatformBackLink>
        ) : preview.isSuccess && catalog.isSuccess && !blocked ? (
          <PlatformEditLink search={{ ...search, edicion: 'cuota' }}>Editar cuota</PlatformEditLink>
        ) : null}
      </div>
      {preview.isPending || catalog.isPending ? (
        <PlatformLoading>Cargando condiciones…</PlatformLoading>
      ) : null}
      {preview.isError || catalog.isError ? (
        <PlatformMessage
          title="No se pudieron consultar las condiciones."
          onRetry={() => {
            if (preview.isError) void preview.refetch()
            if (catalog.isError) void catalog.refetch()
          }}
        />
      ) : null}
      {preview.data && editing !== 'iva' ? (
        <dl className="border-border grid gap-3 border-y py-3 text-sm sm:grid-cols-2">
          <AgreementSummary
            label="Condiciones vigentes"
            terms={preview.data?.current ?? null}
            rates={catalog.data}
          />
          <AgreementSummary label="Próximo cobro u oferta" terms={next} rates={catalog.data} />
        </dl>
      ) : null}
      {editing !== 'iva' && next && fixedNet !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1 text-sm">
            <p className="font-medium">
              Precio pactado: {formatEuros(fixedNet)} sin IVA / {periodUnit(next.period)}
            </p>
            {catalogNet !== null ? (
              <p className="text-muted-foreground">
                Catálogo: {formatEuros(catalogNet)} sin IVA / {periodUnit(next.period)}.
              </p>
            ) : null}
          </div>
          {!editing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              isDisabled={
                Boolean(blocked) ||
                catalogNet === null ||
                !catalog.isSuccess ||
                !preview.isSuccess ||
                mutation.isPending
              }
              onPress={() => {
                if (catalogNet !== null) mutation.mutate({ restoreCatalog: catalogNet })
              }}
            >
              Volver a tarifa de catálogo
            </Button>
          ) : null}
        </div>
      ) : null}
      {preview.isSuccess && editing === 'iva' ? (
        <CompanyBillingVat
          tenantId={tenantId}
          vatPercent={preview.data.vat_percent}
          blocked={vatBlocked}
        />
      ) : null}
      {preview.isSuccess && !editing ? (
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <dl className="text-sm">
            <dt className="text-muted-foreground">IVA del próximo cobro</dt>
            <dd className="mt-0.5 font-semibold">{preview.data.vat_percent} %</dd>
          </dl>
          {!vatBlocked ? (
            <PlatformEditLink search={{ ...search, edicion: 'iva' }}>Editar IVA</PlatformEditLink>
          ) : null}
        </div>
      ) : null}
      {blockMessage ? (
        <Alert variant="warning">
          <AlertTitle>{blockMessage}</AlertTitle>
        </Alert>
      ) : null}
      {editing === 'cuota' &&
      preview.isSuccess &&
      catalog.isSuccess &&
      moduleSubscriptions.isSuccess &&
      !blocked ? (
        <AgreementForm
          key={
            next
              ? `${next.plan}:${next.seats}:${next.period}:${next.base_net_cents ?? next.net_cents}:${fixedNet}`
              : 'new'
          }
          rates={catalog.data}
          members={members}
          terms={next}
          fixedNet={fixedNet}
          moduleSubscriptions={moduleSubscriptions.data}
          vatPercent={preview.data.vat_percent}
          saving={mutation.isPending}
          feedback={
            <PlatformFeedback
              action={mutation}
              success="Condiciones guardadas. No se ha realizado ningún cobro."
            />
          }
          onEdit={() => {
            if (mutation.isSuccess || mutation.isError) mutation.reset()
          }}
          onSave={mutation.mutate}
        />
      ) : null}
      {!editing && !mutation.isIdle ? (
        <PlatformFeedback
          action={mutation}
          success="Tarifa de catálogo restaurada para el próximo cobro. No se ha realizado ningún cobro."
        />
      ) : null}
    </div>
  )
}

function AgreementSummary({
  label,
  terms,
  rates,
}: {
  label: string
  terms: BillingTerms | null
  rates: CatalogRate[] | undefined
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">
        {terms
          ? `${planLabel(terms.plan, rates)} · ${terms.seats} personas · ${formatEuros(terms.amount_cents)} ${billingVatLabel(terms.vat_percent)} / ${periodUnit(terms.period)}`
          : '—'}
      </dd>
    </div>
  )
}

function AgreementForm({
  rates,
  members,
  terms,
  fixedNet,
  moduleSubscriptions,
  vatPercent,
  saving,
  feedback,
  onEdit,
  onSave,
}: {
  rates: CatalogRate[]
  members: number
  terms: BillingTerms | null
  fixedNet: number | null
  moduleSubscriptions: ModuleSubscription[]
  vatPercent: number
  saving: boolean
  feedback: React.ReactNode
  onEdit: () => void
  onSave: (agreement: BillingAgreement) => void
}) {
  const titleId = useId()
  const initialRate = terms
    ? catalogRateForCapacity(rates, terms.plan, terms.seats)
    : smallestRateFor(rates, Math.max(members, 1))
  const [capacity, setCapacity] = useState(
    initialRate ? `${initialRate.plan}:${initialRate.seats}` : '',
  )
  const [period, setPeriod] = useState<Interval>(terms?.period ?? 'month')
  const base = terms?.base_net_cents ?? terms?.net_cents
  const [mode, setMode] = useState(fixedNet !== null ? 'agreed' : 'catalog')
  const initialPrice = fixedNet ?? base
  const [price, setPrice] = useState(initialPrice === undefined ? '' : centsToInput(initialPrice))
  const capacityOptions = rates.flatMap((entry) =>
    entry.plan === 'scale' || entry.plan === 'standard'
      ? Array.from(
          {
            length:
              MAX_SCALE_PLAN_MEMBERS - (entry.plan === 'scale' ? SCALE_PLAN_MIN_MEMBERS : 1) + 1,
          },
          (_, index) => ({
            ...entry,
            seats: (entry.plan === 'scale' ? SCALE_PLAN_MIN_MEMBERS : 1) + index,
          }),
        )
      : [entry],
  )
  const rate = capacityOptions.find((entry) => `${entry.plan}:${entry.seats}` === capacity)
  const agreed = mode === 'agreed'
  const raw = price.trim()
  const customCents = /^\d{1,6}([,.]\d{1,2})?$/.test(raw) ? parseEuros(raw) : 0
  const validPrice = customCents >= 1 && customCents <= 10_000_000
  const netCents = agreed ? (validPrice ? customCents : null) : null
  const quote = rate ? catalogQuote(rate, period) : null
  const moduleNet = rate ? moduleNetForPlan(rate.plan, period, moduleSubscriptions) : 0
  const baseNet = agreed ? netCents : (quote?.net_cents ?? null)
  const totalNet = baseNet === null ? null : baseNet + moduleNet
  const amount = rate && totalNet !== null ? totalNet + applyRate(totalNet, vatPercent) : null
  const canSave = Boolean(rate && rate.seats >= members && amount !== null && !saving)
  const capacityError = rate && rate.seats < members ? 'El tramo no cubre al equipo.' : undefined
  const priceHelp = 'Introduce entre 0,01 € y 100.000 € con hasta dos decimales.'
  const priceError = raw && !validPrice ? priceHelp : undefined

  return (
    <form
      aria-labelledby={titleId}
      className="border-border border-t pt-3"
      onChange={onEdit}
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave && rate) onSave({ plan: rate.plan, period, seats: rate.seats, netCents })
      }}
    >
      <FieldSet disabled={saving} className="min-w-0 gap-3">
        <FieldLegend id={titleId} variant="label">
          Próximas condiciones
        </FieldLegend>
        <div className="grid items-start gap-x-4 gap-y-3 sm:grid-cols-2">
          <PlatformField
            label="Plan y capacidad"
            hint={`El tramo debe cubrir el equipo actual (${members}).`}
            error={capacityError}
          >
            {(control) => (
              <PlatformSelect
                {...control}
                isDisabled={saving}
                placeholder="Selecciona un tramo"
                value={capacity || null}
                options={capacityOptions.map((entry) => ({
                  id: `${entry.plan}:${entry.seats}`,
                  label: `${planLabel(entry.plan, rates)} · ${entry.plan === 'scale' && entry.seats === SCALE_PLAN_MIN_MEMBERS ? 'desde ' : ''}${entry.seats} ${entry.seats === 1 ? 'persona' : 'personas'}`,
                  isDisabled: entry.seats < members,
                }))}
                onChange={(value) => {
                  onEdit()
                  setCapacity(value ?? '')
                }}
              />
            )}
          </PlatformField>
          <PlatformField label="Periodo de facturación">
            {(control) => (
              <PlatformSelect
                {...control}
                value={period}
                isDisabled={saving}
                options={[
                  { id: 'month', label: 'Mensual' },
                  { id: 'year', label: 'Anual' },
                ]}
                onChange={(value) => {
                  onEdit()
                  setPeriod(value === 'year' ? 'year' : 'month')
                  setPrice('')
                }}
              />
            )}
          </PlatformField>
          <PlatformField label="Tipo de tarifa">
            {(control) => (
              <PlatformSelect
                {...control}
                value={mode}
                isDisabled={saving}
                options={[
                  { id: 'catalog', label: 'Tarifa de catálogo' },
                  { id: 'agreed', label: 'Precio pactado' },
                ]}
                onChange={(value) => {
                  onEdit()
                  setMode(value)
                }}
              />
            )}
          </PlatformField>
          {agreed ? (
            <PlatformField
              label={`Precio base sin IVA por ${periodUnit(period)}`}
              hint={priceError ? undefined : priceHelp}
              error={priceError}
            >
              {(control) => (
                <Input
                  {...control}
                  required
                  inputMode="decimal"
                  placeholder={period === 'year' ? 'Ej. 349,00' : 'Ej. 34,90'}
                  value={price}
                  onChange={(event) => setPrice(event.currentTarget.value)}
                />
              )}
            </PlatformField>
          ) : null}
        </div>
        <output className="bg-muted/40 block rounded-md px-3 py-2 text-sm tabular-nums">
          {amount !== null ? (
            <>
              Total previsto: {formatEuros(amount)} {billingVatLabel(vatPercent)} /{' '}
              {periodUnit(period)}.
              {moduleNet > 0 ? <> Incluye {formatEuros(moduleNet)} en módulos, sin IVA.</> : null}
            </>
          ) : (
            'Completa las condiciones para ver el importe previsto.'
          )}
        </output>
        <p className="text-muted-foreground text-xs">
          Los módulos se añaden al precio base. Si pactas un precio, se mantiene al cambiar de
          capacidad. Los cambios se aplican al contratar o renovar, sin cobro inmediato.
        </p>
      </FieldSet>
      <div className="border-border mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button type="submit" isDisabled={!canSave}>
          Guardar condiciones
        </Button>
        {feedback}
      </div>
    </form>
  )
}
