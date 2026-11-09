import { Button } from '@doscientos/ui'

import { formatEuros, perMonthWhenYearly, type Interval, type PlanInfo } from '../domain/plans'

export function PlanOptionCard({
  plan,
  interval,
  members,
  recommended,
  current,
  busy,
  onChoose,
}: {
  plan: PlanInfo
  interval: Interval
  members: number
  recommended: boolean
  current: boolean
  busy: boolean
  onChoose: () => void
}) {
  const fits = members <= plan.members
  const price = interval === 'year' ? perMonthWhenYearly(plan) : plan.monthly

  return (
    <article
      aria-label={`${plan.name}, hasta ${plan.members} ${plan.members === 1 ? 'persona' : 'personas'}`}
      className={`bg-card flex flex-col gap-3 rounded-xl border p-4 ${recommended || current ? 'border-primary ring-primary/20 ring-2' : 'border-border'}`}
    >
      <div className="min-h-16">
        {current ? (
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-1 text-[11px] font-medium">
            Tu plan actual
          </span>
        ) : recommended ? (
          <span className="bg-primary text-primary-foreground rounded-full px-2 py-1 text-[11px] font-medium">
            Te encaja
          </span>
        ) : null}
        <h3 className="mt-2 text-base font-semibold">{plan.name}</h3>
        <p className="text-muted-foreground mt-1 text-xs">{plan.audience}</p>
      </div>

      <p className="text-sm leading-relaxed">{plan.benefit}</p>
      <p className="text-muted-foreground text-xs">
        Hasta {plan.members} {plan.members === 1 ? 'persona' : 'personas'}, incluida quien
        administra.
      </p>

      <div className="mt-auto">
        <p>
          <span className="text-2xl font-semibold">{formatEuros(price)}</span>
          <span className="text-muted-foreground text-xs">
            {' '}
            /mes{interval === 'year' ? ' equivalente' : ''}
          </span>
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {interval === 'year'
            ? `Se cobran ${formatEuros(plan.yearly)} al año, sin IVA.`
            : 'Pago mensual, sin IVA.'}
        </p>
      </div>

      <Button
        className="w-full"
        variant={current ? 'outline' : 'default'}
        isDisabled={current || busy || !fits}
        onPress={onChoose}
      >
        {current ? 'Tu plan' : !fits ? 'No cubre a tu equipo' : `Elegir ${plan.name}`}
      </Button>
    </article>
  )
}
