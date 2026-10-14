import { Button, Tabs, TabsList, TabsTrigger } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  cancelPlan,
  changePlan,
  resumePlan,
  memberCountQuery,
  startCheckout,
  submitToRedsys,
  subscriptionQuery,
  type BillingResult,
  type Subscription,
} from '../application/billing-actions'
import {
  formatEuros,
  includedInEveryPlan,
  perMonthWhenYearly,
  planCatalog,
  planInfo,
  smallestPlanFor,
  TRIAL_DAYS,
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
  if (sub.status === 'past_due') return `Plan ${plan?.name ?? ''}: no hemos podido cobrar la última cuota. Vuelve a elegir un plan para pagar con tarjeta.`
  if (sub.cancelAtPeriodEnd) return `Plan ${plan?.name ?? ''}: se cancela el ${until}. Hasta entonces sigue todo igual.`
  return `Plan ${plan?.name ?? ''}, ${sub.interval === 'year' ? 'anual' : 'mensual'}. Próxima renovación: ${until}.`
}

/** Plan and payment. Only rendered for the owner. */
export function BillingSection({ tenantId }: { tenantId: string }) {
  const subscription = useQuery(subscriptionQuery(tenantId)).data
  const [interval, setInterval] = useState<Interval>('year')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const queryClient = useQueryClient()

  async function go(key: string, action: () => Promise<BillingResult>) {
    setBusy(key)
    setError('')
    const result = await action()
    if (result.ok && result.form) return submitToRedsys(result.form)
    if (result.ok) await queryClient.invalidateQueries({ queryKey: ['subscription', tenantId] })
    else setError(result.message)
    setBusy(null)
  }

  const subscribed = subscription && ['active', 'past_due'].includes(subscription.status)
  const members = useQuery(memberCountQuery(tenantId)).data ?? 1
  const needed = smallestPlanFor(members)
  const onTrial = subscription?.status === 'trialing'
  const recommended = onTrial ? needed?.id : undefined

  return (
    <section className="border-border bg-card rounded-xl border">
      <div className="border-border border-b px-5 py-4">
        <h2 className="text-sm font-semibold">Plan y facturación</h2>
        <p className="text-muted-foreground text-xs">
          {subscription ? currentLine(subscription) : 'Cargando…'}
        </p>
      </div>

      <div className="space-y-5 p-5">
        {onTrial ? (
          <div className="bg-accent text-accent-foreground rounded-lg px-4 py-3 text-sm">
            <p className="font-medium">
              {subscription.canWrite
                ? `Estás probando el plan Empresa completo durante ${TRIAL_DAYS} días, gratis.`
                : 'Tu prueba gratuita ha terminado.'}
            </p>
            <p className="mt-1 text-xs">
              {needed
                ? `Ahora sois ${members} ${members === 1 ? 'persona' : 'personas'}: te encaja el plan ${needed.name} (${formatEuros(needed.monthly)} al mes). `
                : `Ahora sois ${members} personas, más de las que admite cualquier plan. `}
              Si prefieres uno más pequeño, quita el acceso a las personas que sobren en Equipo.
            </p>
          </div>
        ) : null}

        <Tabs selectedKey={interval} onSelectionChange={(key) => setInterval(key as Interval)}>
          <TabsList aria-label="Periodo de pago" className="w-full sm:w-fit">
            <TabsTrigger id="year" className="flex-1 sm:flex-none">
              Anual
              <span className="bg-primary/10 text-primary rounded-full px-1.5 text-[11px]">2 meses gratis</span>
            </TabsTrigger>
            <TabsTrigger id="month" className="flex-1 sm:flex-none">
              Mensual
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid gap-4 sm:grid-cols-3">
          {planCatalog.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              interval={interval}
              recommended={recommended === plan.id}
              current={subscribed === true && subscription?.plan === plan.id}
              busy={busy === plan.id}
              onChoose={() =>
                void go(plan.id, () =>
                  subscription?.status === 'active'
                    ? changePlan(tenantId, plan.id, interval)
                    : startCheckout(tenantId, plan.id, interval),
                )
              }
            />
          ))}
        </div>

        <p className="border-border bg-muted/40 rounded-lg border border-dashed p-3 text-sm">
          ¿Buscas algo más personalizado? Llámanos al{' '}
          <a href="tel:+34624140151" className="text-primary font-medium whitespace-nowrap hover:underline">
            624 14 01 51
          </a>
          .
        </p>

        <ul className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-2">
          {includedInEveryPlan.map((item) => (
            <li key={item}>✓ {item}</li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          Precios sin IVA (se añade el 21 %). Pago con tarjeta, renovación automática. Sin permanencia: cancelas
          cuando quieras y sigues hasta el final del periodo pagado. Un cambio de plan se aplica en la próxima renovación.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {error ? <output className="text-destructive text-sm">{error}</output> : <span />}
          {subscription?.status === 'active' ? (
            <Button
              variant="outline"
              isDisabled={busy !== null}
              onPress={() => void go('cancel', () => (subscription.cancelAtPeriodEnd ? resumePlan(tenantId) : cancelPlan(tenantId)))}
            >
              {subscription.cancelAtPeriodEnd ? 'Mantener mi plan' : 'Cancelar al final del periodo'}
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
  recommended: boolean
  busy: boolean
  onChoose: () => void
}) {
  const { plan, interval, current, recommended, busy, onChoose } = props
  const price = interval === 'year' ? perMonthWhenYearly(plan) : plan.monthly
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-4 ${current || recommended ? 'border-primary ring-primary/20 ring-2' : 'border-border'}`}
    >
      {recommended ? (
        <span className="bg-primary text-primary-foreground w-fit rounded-full px-2 py-0.5 text-[11px] font-medium">
          Te encaja
        </span>
      ) : null}
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
