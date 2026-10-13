import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { openPortal, startCheckout, subscriptionQuery, type Subscription } from '../application/billing-actions'
import {
  formatEuros,
  includedInEveryPlan,
  perMonthWhenYearly,
  planCatalog,
  planInfo,
  type Interval,
  type PlanInfo,
} from '../domain/plans'

const dateFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

function currentLine(sub: Subscription): string {
  const plan = planInfo(sub.plan)
  const until = sub.currentPeriodEnd ? dateFormat.format(sub.currentPeriodEnd) : ''
  if (sub.status === 'trialing' && sub.canWrite) {
    return `Prueba gratuita: te quedan ${sub.trialDaysLeft} ${sub.trialDaysLeft === 1 ? 'día' : 'días'}.`
  }
  if (sub.status === 'trialing') return 'Tu prueba ha terminado. Tus datos están a salvo, solo en lectura.'
  if (sub.status === 'canceled') return 'Sin plan activo. Tus datos están a salvo, solo en lectura.'
  if (sub.status === 'past_due') return `Plan ${plan?.name ?? ''}: no hemos podido cobrar la última cuota. Actualiza la tarjeta.`
  if (sub.cancelAtPeriodEnd) return `Plan ${plan?.name ?? ''}: se cancela el ${until}. Hasta entonces sigue todo igual.`
  return `Plan ${plan?.name ?? ''}, ${sub.interval === 'year' ? 'anual' : 'mensual'}. Próxima renovación: ${until}.`
}

/** Plan and payment. Only rendered for the owner, never in demo mode. */
export function BillingSection({ tenantId }: { tenantId: string }) {
  const subscription = useQuery(subscriptionQuery(tenantId)).data
  const [interval, setInterval] = useState<Interval>('year')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function go(key: string, action: () => ReturnType<typeof openPortal>) {
    setBusy(key)
    setError('')
    const result = await action()
    if (result.ok) window.location.assign(result.url)
    else {
      setError(result.message)
      setBusy(null)
    }
  }

  const subscribed = subscription && ['active', 'past_due'].includes(subscription.status)

  return (
    <section className="border-border bg-card rounded-xl border">
      <div className="border-border border-b px-5 py-4">
        <h2 className="text-sm font-semibold">Plan y facturación</h2>
        <p className="text-muted-foreground text-xs">
          {subscription ? currentLine(subscription) : 'Cargando…'}
        </p>
      </div>

      <div className="space-y-5 p-5">
        <div className="flex items-center gap-2" role="group" aria-label="Periodo de pago">
          {(['year', 'month'] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={interval === value ? 'default' : 'outline'}
              onPress={() => setInterval(value)}
            >
              {value === 'year' ? 'Anual · 2 meses gratis' : 'Mensual'}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {planCatalog.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              interval={interval}
              current={subscribed === true && subscription?.plan === plan.id}
              busy={busy === plan.id}
              onChoose={() =>
                void go(plan.id, () => (subscribed ? openPortal(tenantId) : startCheckout(tenantId, plan.id, interval)))
              }
            />
          ))}
        </div>

        <ul className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-2">
          {includedInEveryPlan.map((item) => (
            <li key={item}>✓ {item}</li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          Precios sin IVA. Sin permanencia: cancelas cuando quieras y sigues hasta el final del periodo pagado.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {error ? <output className="text-destructive text-sm">{error}</output> : <span />}
          {subscription?.status !== 'trialing' || subscribed ? (
            <Button variant="outline" isDisabled={busy !== null} onPress={() => void go('portal', () => openPortal(tenantId))}>
              Gestionar pago y facturas
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function PlanCard(props: {
  plan: PlanInfo
  interval: Interval
  current: boolean
  busy: boolean
  onChoose: () => void
}) {
  const { plan, interval, current, busy, onChoose } = props
  const price = interval === 'year' ? perMonthWhenYearly(plan) : plan.monthly
  return (
    <div className={`flex flex-col gap-3 rounded-lg border p-4 ${current ? 'border-primary' : 'border-border'}`}>
      <div>
        <h3 className="text-sm font-semibold">{plan.name}</h3>
        <p className="text-muted-foreground text-xs">{plan.audience}</p>
      </div>
      <p>
        <span className="text-2xl font-semibold">{formatEuros(price)}</span>
        <span className="text-muted-foreground text-xs"> /mes</span>
      </p>
      <p className="text-muted-foreground text-xs">
        {interval === 'year' ? `${formatEuros(plan.yearly)} al año` : 'Se cobra cada mes'}
      </p>
      <Button
        className="mt-auto"
        variant={current ? 'outline' : 'default'}
        isDisabled={current || busy}
        onPress={onChoose}
      >
        {current ? 'Tu plan' : `Elegir ${plan.name}`}
      </Button>
    </div>
  )
}
