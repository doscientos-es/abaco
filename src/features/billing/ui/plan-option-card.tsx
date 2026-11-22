import type { ReactNode } from 'react'

import {
  billingVatLabel,
  formatEuros,
  SCALE_PLAN_MIN_MEMBERS,
  type CatalogRate,
  type BillingTerms,
  type PlanInfo,
} from '../domain/plans'

export function PlanOptionCard({
  plan,
  rate,
  terms,
  recommended,
  fixedPrice = false,
  children,
}: {
  plan: PlanInfo
  rate: CatalogRate
  terms: BillingTerms
  recommended: boolean
  fixedPrice?: boolean
  children?: ReactNode
}) {
  const yearly = terms.period === 'year'
  const price = terms.net_cents / (yearly ? 1200 : 100)
  const capacity =
    plan.id === 'standard'
      ? `${terms.seats} ${terms.seats === 1 ? 'persona' : 'personas'}`
      : plan.id === 'scale'
        ? `desde ${Math.max(SCALE_PLAN_MIN_MEMBERS, terms.seats)} personas`
        : `hasta ${terms.seats} ${terms.seats === 1 ? 'persona' : 'personas'}`

  return (
    <article
      aria-label={`${plan.name}, ${capacity}`}
      className={`bg-card flex flex-col gap-3 rounded-xl border p-4 ${recommended ? 'border-primary ring-primary/20 ring-2' : 'border-border'}`}
    >
      <div className="min-h-16">
        {recommended ? (
          <span className="bg-primary text-primary-foreground rounded-full px-2 py-1 text-[11px] font-medium">
            Te encaja
          </span>
        ) : null}
        <h3 className="mt-2 text-base font-semibold">{plan.name}</h3>
        <p className="text-muted-foreground mt-1 text-xs">{plan.audience}</p>
      </div>

      <p className="text-sm leading-relaxed">{plan.benefit}</p>
      <p className="text-muted-foreground text-xs">{capacity}, incluida quien administra.</p>
      {plan.id !== 'standard' ? (
        <p className="text-muted-foreground text-xs">Condiciones del plan anterior.</p>
      ) : null}

      <div className="mt-auto">
        <p>
          <span className="text-2xl font-semibold">{formatEuros(price)}</span>
          <span className="text-muted-foreground text-xs">
            {' '}
            /mes{yearly ? ' equivalente' : ''} sin IVA
          </span>
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {formatEuros(terms.amount_cents / 100)} {billingVatLabel(terms.vat_percent)},{' '}
          {yearly ? 'en un único pago anual' : 'al mes'}.
        </p>
        {plan.id === 'standard' && !fixedPrice ? (
          <p className="text-muted-foreground mt-1 text-xs">
            {formatEuros((yearly ? rate.yearly_cents : rate.monthly_cents) / 100)} de cuota base
            {yearly ? ' al año' : ' al mes'}, con una persona incluida;{' '}
            {formatEuros(((rate.seat_monthly_cents ?? 0) * (yearly ? 12 : 1)) / 100)} por cada plaza
            adicional {yearly ? 'al año' : 'al mes'}.
          </p>
        ) : plan.id === 'scale' ? (
          <p className="text-muted-foreground mt-1 text-xs">
            {yearly ? 'Desglose anual: ' : 'Desglose: '}
            {formatEuros((yearly ? rate.yearly_cents : rate.monthly_cents) / 100)} de base +{' '}
            {formatEuros(((rate.seat_monthly_cents ?? 0) * (yearly ? 10 : 1)) / 100)} por plaza ×{' '}
            {terms.seats} plazas {yearly ? 'al año' : 'al mes'}.
          </p>
        ) : null}
      </div>

      {children}
    </article>
  )
}
