import { LinkButton } from '@doscientos/ui'

import { fieldIcons } from '@/shared/ui/field-icons'

import {
  formatEuros,
  perMonthWhenYearlyAmount,
  scalePlanMonthlyPrice,
  MAX_SCALE_PLAN_MEMBERS,
  SCALE_PLAN_EXTRA_MEMBER_MONTHLY,
  SCALE_PLAN_MIN_MEMBERS,
  SCALE_PLAN_START_MONTHLY,
  type Interval,
} from '../domain/plans'

export function ScalePlanCard({
  members,
  interval,
  recommended,
}: {
  members: number
  interval: Interval
  recommended: boolean
}) {
  const pricedMembers = Math.min(MAX_SCALE_PLAN_MEMBERS, Math.max(SCALE_PLAN_MIN_MEMBERS, members))
  const monthly = scalePlanMonthlyPrice(pricedMembers) ?? SCALE_PLAN_START_MONTHLY
  const yearly = monthly * 10
  const price = interval === 'year' ? perMonthWhenYearlyAmount(yearly) : monthly
  const belowScale = members < SCALE_PLAN_MIN_MEMBERS

  return (
    <article
      aria-label={`Ábaco Escala, ${SCALE_PLAN_MIN_MEMBERS} a ${MAX_SCALE_PLAN_MEMBERS} personas`}
      className={`bg-card flex flex-col gap-3 rounded-xl border p-4 ${recommended ? 'border-primary ring-primary/20 ring-2' : 'border-border'}`}
    >
      <div className="min-h-16">
        {recommended ? (
          <span className="bg-primary text-primary-foreground rounded-full px-2 py-1 text-[11px] font-medium">
            Te encaja
          </span>
        ) : null}
        <h3 className="mt-2 text-base font-semibold">Ábaco Escala</h3>
        <p className="text-muted-foreground mt-1 text-xs">
          Para empresas con varias cuadrillas y operaciones en crecimiento.
        </p>
      </div>

      <p className="text-sm leading-relaxed">
        Amplía el acceso de tu equipo y organiza personas, equipos y trabajos desde una misma
        cuenta.
      </p>
      <p className="text-muted-foreground text-xs">
        De {SCALE_PLAN_MIN_MEMBERS} a {MAX_SCALE_PLAN_MEMBERS} personas, incluida quien administra.
      </p>

      <div className="mt-auto">
        <p>
          {belowScale ? <span className="text-muted-foreground text-xs">Desde </span> : null}
          <span className="text-2xl font-semibold">{formatEuros(price)}</span>
          <span className="text-muted-foreground text-xs">
            {' '}
            /mes{interval === 'year' ? ' equivalente' : ''}
          </span>
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {interval === 'year'
            ? `${formatEuros(yearly)} al año para ${pricedMembers} personas, sin IVA.`
            : `Para ${pricedMembers} personas, sin IVA.`}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Tarifa mensual orientativa: {formatEuros(SCALE_PLAN_START_MONTHLY)} para{' '}
          {SCALE_PLAN_MIN_MEMBERS} personas y {formatEuros(SCALE_PLAN_EXTRA_MEMBER_MONTHLY)} por
          persona adicional. Pago anual: 10 mensualidades. El precio final se confirma antes de
          contratar.
        </p>
      </div>

      <LinkButton
        href="tel:+34624140151"
        variant="outline"
        className="w-full"
        aria-label="Llámanos para consultar Ábaco Escala"
      >
        {fieldIcons.phone} Consultar Ábaco Escala
      </LinkButton>
    </article>
  )
}
