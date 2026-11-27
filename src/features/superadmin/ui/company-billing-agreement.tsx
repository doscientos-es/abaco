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
import { baseForGrossCharge } from '../domain/agreed-charge'
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
  const catalogNet =
    next && catalogRate
      ? catalogQuote({ ...catalogRate, seats: next.seats }, next.period).net_cents
      : null
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
              ? 'Editar plan y cuota'
              : editing === 'iva'
                ? 'Editar IVA'
                : 'Condiciones de facturación'}
          </h3>
          <p className="text-muted-foreground text-sm">
            El plan y la cuota guardados se aplican a la próxima renovación automática o al primer
            pago. Guardar no realiza un cargo.
          </p>
        </div>
        {editing ? (
          <PlatformBackLink search={withoutEditor(search)}>Volver a suscripción</PlatformBackLink>
        ) : preview.isSuccess && catalog.isSuccess && !blocked ? (
          <PlatformEditLink search={{ ...search, edicion: 'cuota' }}>
            Editar plan y cuota
          </PlatformEditLink>
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
      {editing === 'cuota' && !blocked && moduleSubscriptions.isPending ? (
        <PlatformLoading>Cargando módulos para calcular el precio…</PlatformLoading>
      ) : null}
      {editing === 'cuota' && !blocked && moduleSubscriptions.isError ? (
        <PlatformMessage
          title="No se pudieron consultar los módulos para calcular el precio."
          onRetry={() => void moduleSubscriptions.refetch()}
        />
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
    initialRate
      ? `${initialRate.plan}:${initialRate.plan === 'standard' || initialRate.plan === 'scale' ? 'variable' : initialRate.seats}`
      : '',
  )
  const [seats, setSeats] = useState(
    String(terms?.seats ?? initialRate?.seats ?? Math.max(members, 1)),
  )
  const [period, setPeriod] = useState<Interval>(terms?.period ?? 'month')
  const base = terms?.base_net_cents ?? terms?.net_cents
  const [mode, setMode] = useState(fixedNet !== null ? 'agreed' : 'catalog')
  const initialPrice = fixedNet ?? base
  const [price, setPrice] = useState(initialPrice === undefined ? '' : centsToInput(initialPrice))
  const capacityOptions = rates.map((entry) => ({
    entry,
    variable: entry.plan === 'scale' || entry.plan === 'standard',
    id: `${entry.plan}:${entry.plan === 'scale' || entry.plan === 'standard' ? 'variable' : entry.seats}`,
  }))
  const selected = capacityOptions.find((option) => option.id === capacity)
  const count = Number(seats)
  const minSeats = selected?.entry.plan === 'scale' ? SCALE_PLAN_MIN_MEMBERS : 1
  const variableValid =
    /^\d+$/.test(seats) &&
    Number.isInteger(count) &&
    count >= minSeats &&
    count <= MAX_SCALE_PLAN_MEMBERS
  const rate = selected?.variable
    ? variableValid
      ? { ...selected.entry, seats: count }
      : null
    : (selected?.entry ?? null)
  const agreed = mode === 'agreed' || mode === 'gross'
  const exactGross = mode === 'gross'
  const raw = price.trim()
  const customCents = /^\d{1,6}([,.]\d{1,2})?$/.test(raw) ? parseEuros(raw) : 0
  const quote = rate ? catalogQuote(rate, period) : null
  const moduleNet = rate ? moduleNetForPlan(rate.plan, period, moduleSubscriptions) : 0
  const netCents = !agreed
    ? null
    : exactGross
      ? baseForGrossCharge(customCents, moduleNet, vatPercent)
      : customCents >= 1 && customCents <= 10_000_000
        ? customCents
        : null
  const baseNet = agreed ? netCents : (quote?.net_cents ?? null)
  const totalNet = baseNet === null ? null : baseNet + moduleNet
  const amount = rate && totalNet !== null ? totalNet + applyRate(totalNet, vatPercent) : null
  const canSave = Boolean(rate && rate.seats >= members && amount !== null && !saving)
  const capacityError = rate && rate.seats < members ? 'El tramo no cubre al equipo.' : undefined
  const priceHelp = 'Introduce entre 0,01 € y 100.000 € con hasta dos decimales.'
  const priceError =
    raw && netCents === null
      ? exactGross
        ? 'No se puede obtener ese total con el IVA y los módulos seleccionados. Prueba otro importe.'
        : priceHelp
      : undefined

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
                options={capacityOptions.map(({ entry, variable, id }) => ({
                  id,
                  label: variable
                    ? `${planLabel(entry.plan, rates)} · por persona`
                    : `${planLabel(entry.plan, rates)} · ${entry.seats} ${entry.seats === 1 ? 'persona' : 'personas'}`,
                  isDisabled: !variable && entry.seats < members,
                }))}
                onChange={(value) => {
                  onEdit()
                  setCapacity(value ?? '')
                  const option = capacityOptions.find((item) => item.id === value)
                  if (option?.variable)
                    setSeats(
                      String(
                        Math.max(
                          members,
                          option.entry.plan === 'scale' ? SCALE_PLAN_MIN_MEMBERS : 1,
                        ),
                      ),
                    )
                }}
              />
            )}
          </PlatformField>
          {selected?.variable ? (
            <PlatformField
              label="Personas con acceso"
              hint={`Entre ${minSeats} y ${MAX_SCALE_PLAN_MEMBERS}; actualmente hay ${members}.`}
              error={
                !variableValid
                  ? `Indica un número entero entre ${minSeats} y ${MAX_SCALE_PLAN_MEMBERS}.`
                  : capacityError
              }
            >
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min={minSeats}
                  max={MAX_SCALE_PLAN_MEMBERS}
                  step={1}
                  value={seats}
                  onChange={(event) => setSeats(event.currentTarget.value)}
                />
              )}
            </PlatformField>
          ) : null}
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
                  { id: 'agreed', label: 'Base pactada sin IVA' },
                  { id: 'gross', label: 'Total exacto con IVA y módulos' },
                ]}
                onChange={(value) => {
                  onEdit()
                  if (value !== mode && (value === 'gross' || mode === 'gross')) {
                    setPrice(
                      value === 'gross' && amount !== null
                        ? centsToInput(amount)
                        : baseNet === null
                          ? ''
                          : centsToInput(baseNet),
                    )
                  }
                  setMode(value)
                }}
              />
            )}
          </PlatformField>
          {agreed ? (
            <PlatformField
              label={
                exactGross
                  ? `Total a cobrar por ${periodUnit(period)}`
                  : `Precio base sin IVA por ${periodUnit(period)}`
              }
              hint={
                priceError
                  ? undefined
                  : exactGross
                    ? 'Con los módulos y el IVA actuales, antes de descuentos. Si cambian, el total puede variar.'
                    : priceHelp
              }
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
              <span className="text-muted-foreground mt-1 block">
                Base: {formatEuros(baseNet ?? 0)} · Módulos: {formatEuros(moduleNet)} · IVA:{' '}
                {formatEuros(amount - (totalNet ?? 0))}.
              </span>
            </>
          ) : (
            'Completa las condiciones para ver el importe previsto.'
          )}
        </output>
        <p className="text-muted-foreground text-xs">
          Se guarda el precio base pactado, independientemente de la capacidad. El importe final
          puede variar si cambian los módulos, el IVA o se aplica un descuento.
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
