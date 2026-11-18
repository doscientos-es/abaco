import { Button, Input } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  billingCatalogQuery,
  billingPreviewQuery,
  billingVatLabel,
  catalogQuote,
  planInfo,
  smallestRateFor,
  subscriptionQuery,
  type BillingTerms,
  type CatalogRate,
  type Interval,
} from '@/features/billing'
import { applyRate, centsToInput, formatEuros, parseEuros } from '@/shared/domain/money'

import { scheduleBillingAgreement, type BillingAgreement } from '../application/superadmin-queries'
import { CompanyBillingVat } from './company-billing-vat'

const periodUnit = (period: Interval) => (period === 'year' ? 'año' : 'mes')

export function CompanyBillingAgreement({
  tenantId,
  members,
  subscriptionStatus,
}: {
  tenantId: string
  members: number
  subscriptionStatus: string
}) {
  const catalog = useQuery(billingCatalogQuery)
  const previewOptions = billingPreviewQuery(tenantId)
  const preview = useQuery(previewOptions)
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (agreement: BillingAgreement) => scheduleBillingAgreement(tenantId, agreement),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: previewOptions.queryKey }),
        queryClient.invalidateQueries({ queryKey: subscriptionQuery(tenantId).queryKey }),
      ]),
  })
  const next = preview.data?.next ?? null
  const blocked = preview.data?.cancel_at_period_end
    ? 'Retira la cancelación antes de cambiar las condiciones.'
    : preview.data?.pending || subscriptionStatus === 'past_due'
      ? 'Resuelve el pago pendiente antes de cambiar las condiciones.'
      : null

  return (
    <div className="border-border bg-card space-y-4 rounded-lg border p-4 sm:p-5">
      <h3 className="font-semibold">Condiciones de facturación</h3>
      {preview.isPending || catalog.isPending ? <output>Cargando condiciones…</output> : null}
      {preview.isError || catalog.isError ? (
        <p role="alert">No se pudieron consultar las condiciones.</p>
      ) : null}
      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        <AgreementSummary label="Condiciones vigentes" terms={preview.data?.current ?? null} />
        <AgreementSummary label="Próximo cobro u oferta" terms={next} />
      </dl>
      {preview.isSuccess ? (
        <CompanyBillingVat
          key={preview.data.vat_percent}
          tenantId={tenantId}
          vatPercent={preview.data.vat_percent}
          blocked={preview.data.pending || subscriptionStatus === 'past_due'}
        />
      ) : null}
      {blocked ? <output className="block">{blocked}</output> : null}
      {preview.isSuccess && catalog.isSuccess && !blocked ? (
        <AgreementForm
          key={
            next
              ? `${next.plan}:${next.seats}:${next.period}:${next.base_net_cents ?? next.net_cents}`
              : 'new'
          }
          rates={catalog.data}
          members={members}
          terms={next}
          moduleMonthly={preview.data.module_monthly_cents ?? 0}
          moduleYearly={preview.data.module_yearly_cents ?? 0}
          vatPercent={preview.data.vat_percent}
          saving={mutation.isPending}
          onSave={mutation.mutate}
        />
      ) : null}
      {mutation.error ? <p role="alert">{mutation.error.message}</p> : null}
      {mutation.isSuccess ? (
        <output className="block">Condiciones guardadas. No se ha realizado ningún cobro.</output>
      ) : null}
    </div>
  )
}

function AgreementSummary({ label, terms }: { label: string; terms: BillingTerms | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {terms
          ? `${planInfo(terms.plan)?.name ?? terms.plan} · ${terms.seats} personas · ${formatEuros(terms.amount_cents)} ${billingVatLabel(terms.vat_percent)} / ${periodUnit(terms.period)}`
          : '—'}
      </dd>
    </div>
  )
}

function AgreementForm({
  rates,
  members,
  terms,
  moduleMonthly,
  moduleYearly,
  vatPercent,
  saving,
  onSave,
}: {
  rates: CatalogRate[]
  members: number
  terms: BillingTerms | null
  moduleMonthly: number
  moduleYearly: number
  vatPercent: number
  saving: boolean
  onSave: (agreement: BillingAgreement) => void
}) {
  const initialRate = terms
    ? rates.find((rate) => rate.plan === terms.plan && rate.seats === terms.seats)
    : smallestRateFor(rates, Math.max(members, 1))
  const [seats, setSeats] = useState(initialRate?.seats ?? 0)
  const [period, setPeriod] = useState<Interval>(terms?.period ?? 'month')
  const base = terms?.base_net_cents ?? terms?.net_cents
  const [mode, setMode] = useState(
    terms && initialRate && base !== catalogQuote(initialRate, terms.period).net_cents
      ? 'agreed'
      : 'catalog',
  )
  const [price, setPrice] = useState(base === undefined ? '' : centsToInput(base))
  const rate = rates.find((entry) => entry.seats === seats)
  const agreed = mode === 'agreed'
  const raw = price.trim()
  const customCents = /^\d{1,6}([,.]\d{1,2})?$/.test(raw) ? parseEuros(raw) : 0
  const validPrice = customCents >= 1 && customCents <= 10_000_000
  const netCents = agreed ? (validPrice ? customCents : null) : null
  const quote = rate ? catalogQuote(rate, period) : null
  const moduleNet = period === 'year' ? moduleYearly : moduleMonthly
  const baseNet = agreed ? netCents : (quote?.net_cents ?? null)
  const totalNet = baseNet === null ? null : baseNet + moduleNet
  const amount = rate && totalNet !== null ? totalNet + applyRate(totalNet, vatPercent) : null
  const canSave = Boolean(rate && rate.seats >= members && amount !== null && !saving)

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave && rate) onSave({ plan: rate.plan, period, seats: rate.seats, netCents })
      }}
    >
      <fieldset disabled={saving} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            Plan y capacidad
            <select
              required
              value={seats}
              onChange={(event) => setSeats(Number(event.currentTarget.value))}
            >
              <option value={0}>Seleccionar</option>
              {rates.map((entry) => (
                <option key={entry.seats} value={entry.seats} disabled={entry.seats < members}>
                  {planInfo(entry.plan)?.name ?? entry.plan} · {entry.seats}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Periodo
            <select
              value={period}
              onChange={(event) => {
                setPeriod(event.currentTarget.value === 'year' ? 'year' : 'month')
                setPrice('')
              }}
            >
              <option value="month">Mensual</option>
              <option value="year">Anual</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Tarifa
            <select value={mode} onChange={(event) => setMode(event.currentTarget.value)}>
              <option value="catalog">Tarifa de catálogo</option>
              <option value="agreed">Precio pactado</option>
            </select>
          </label>
          {agreed ? (
            <label className="grid gap-1 text-sm">
              Precio base sin IVA por {periodUnit(period)}
              <Input
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.currentTarget.value)}
              />
            </label>
          ) : null}
        </div>
        {rate && rate.seats < members ? <p role="alert">El tramo no cubre al equipo.</p> : null}
        {agreed && raw && !validPrice ? (
          <p role="alert">Introduce entre 0,01 € y 100.000 € con hasta dos decimales.</p>
        ) : null}
        {amount !== null ? (
          <p className="text-sm">
            Total previsto: {formatEuros(amount)} {billingVatLabel(vatPercent)} /{' '}
            {periodUnit(period)}.
            {moduleNet > 0 ? <> Incluye {formatEuros(moduleNet)} en módulos, sin IVA.</> : null}
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Los módulos de pago se añaden al precio base. El cambio se aplica al contratar o al
          renovar, sin cobro inmediato.
        </p>
        <Button type="submit" isDisabled={!canSave}>
          Guardar condiciones
        </Button>
      </fieldset>
    </form>
  )
}
