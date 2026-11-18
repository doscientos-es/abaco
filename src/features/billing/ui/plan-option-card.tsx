import type { ReactNode } from 'react'

import { formatEuros, type BillingTerms, type PlanInfo } from '../domain/plans'

export function PlanOptionCard({
  plan,
  terms,
  recommended,
  children,
}: {
  plan: PlanInfo
  terms: BillingTerms
  recommended: boolean
  children?: ReactNode
}) {
  const yearly = terms.period === 'year'
  const price = terms.net_cents / (yearly ? 1200 : 100)

  return (
    <article
      aria-label={`${plan.name}, hasta ${terms.seats} ${terms.seats === 1 ? 'persona' : 'personas'}`}
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
      <p className="text-muted-foreground text-xs">
        Hasta {terms.seats} {terms.seats === 1 ? 'persona' : 'personas'}, incluida quien administra.
      </p>

      <div className="mt-auto">
        <p>
          <span className="text-2xl font-semibold">{formatEuros(price)}</span>
          <span className="text-muted-foreground text-xs">
            {' '}
            /mes{yearly ? ' equivalente' : ''} sin IVA
          </span>
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {formatEuros(terms.amount_cents / 100)} con IVA,{' '}
          {yearly ? 'en un único pago anual' : 'al mes'}.
        </p>
      </div>

      {children}
    </article>
  )
}
