import { Button, Tabs, TabsList, TabsTrigger } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

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
  includedInEveryPlan,
  MAX_SCALE_PLAN_MEMBERS,
  planCatalog,
  planInfo,
  smallestPlanFor,
  TRIAL_DAYS,
  type Interval,
} from '../domain/plans'
import { CustomPlanCard } from './custom-plan-card'
import { PaymentHistory } from './payment-history'
import { PlanOptionCard } from './plan-option-card'
import { ScalePlanCard } from './scale-plan-card'

const dateFormat = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function currentLine(sub: Subscription): string {
  const plan = planInfo(sub.plan)
  const until = sub.currentPeriodEnd ? dateFormat.format(sub.currentPeriodEnd) : ''
  if (sub.status === 'trialing' && sub.canWrite) {
    return `Prueba gratuita: te quedan ${sub.trialDaysLeft} ${sub.trialDaysLeft === 1 ? 'día' : 'días'}.`
  }
  if (sub.status === 'trialing')
    return 'Tu prueba ha terminado. Tus datos están a salvo, solo en lectura.'
  if (sub.status === 'canceled') return 'Sin plan activo. Tus datos están a salvo, solo en lectura.'
  if (sub.status === 'past_due')
    return `Plan ${plan?.name ?? ''}: no hemos podido cobrar la última cuota. Vuelve a elegir un plan para pagar con tarjeta.`
  if (sub.cancelAtPeriodEnd)
    return `Plan ${plan?.name ?? ''}: se cancela el ${until}. Hasta entonces sigue todo igual.`
  return `Plan ${plan?.name ?? ''}, ${sub.interval === 'year' ? 'anual' : 'mensual'}. Próxima renovación: ${until}.`
}

/** Plan and payment. Only rendered for admins. */
export function BillingSection({
  tenantId,
  companyName,
}: {
  tenantId: string
  companyName: string
}) {
  const subscription = useQuery(subscriptionQuery(tenantId)).data
  const [interval, setInterval] = useState<Interval>('year')
  const [selectedMembers, setSelectedMembers] = useState<number | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const queryClient = useQueryClient()

  // Vuelta de Redsys (?pago=ok | cancelado). El aviso del banco (webhook) puede tardar unos segundos:
  // se consulta el plan cada 3 s, hasta 45 s, hasta que aparezca activo.
  const [returned] = useState(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('pago'),
  )
  const activated = subscription?.status === 'active'
  useEffect(() => {
    if (returned) window.history.replaceState(null, '', window.location.pathname)
  }, [returned])
  useEffect(() => {
    if (returned !== 'ok') return
    let tries = 0
    const timer = window.setInterval(() => {
      tries += 1
      void queryClient.invalidateQueries({ queryKey: ['subscription', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['billing-payments', tenantId] })
      if (tries >= 15) window.clearInterval(timer)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [returned, queryClient, tenantId])

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      // Browser Back can restore this page with the pre-redirect disabled state.
      setBusy(null)
      void queryClient.invalidateQueries({ queryKey: ['subscription', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['billing-payments', tenantId] })
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [queryClient, tenantId])

  async function go(key: string, action: () => Promise<BillingResult>) {
    setBusy(key)
    setError('')
    try {
      const result = await action()
      if (result.ok && result.form) return submitToRedsys(result.form)
      if (result.ok) await queryClient.invalidateQueries({ queryKey: ['subscription', tenantId] })
      else setError(result.message)
    } catch {
      setError('No se pudo completar la operación. Inténtalo de nuevo.')
    } finally {
      setBusy(null)
    }
  }

  const subscribed = subscription && ['active', 'past_due'].includes(subscription.status)
  const members = Math.max(1, useQuery(memberCountQuery(tenantId)).data ?? 1)
  const minimumMembers = Math.min(members, MAX_SCALE_PLAN_MEMBERS)
  const selectedMemberCount = Math.min(
    MAX_SCALE_PLAN_MEMBERS,
    Math.max(minimumMembers, selectedMembers ?? members),
  )
  const selectedPlan =
    members <= MAX_SCALE_PLAN_MEMBERS ? smallestPlanFor(selectedMemberCount) : null
  const needed = smallestPlanFor(members)
  const onTrial = subscription?.status === 'trialing'
  const recommended = onTrial ? selectedPlan?.id : undefined
  const recommendedScale = onTrial && selectedPlan === null

  if (subscription?.isComplimentary) {
    return (
      <section className="border-border bg-card rounded-xl border px-5 py-4">
        <h2 className="text-sm font-semibold">Plan y facturación</h2>
        <p className="text-muted-foreground text-sm">
          Acceso de cortesía: sin caducidad ni renovaciones automáticas.
        </p>
        <div className="mt-5">
          <PaymentHistory
            tenantId={tenantId}
            companyName={companyName}
            subscription={subscription}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="border-border bg-card rounded-xl border">
      <div className="border-border border-b px-5 py-4">
        <h2 className="text-sm font-semibold">Plan y facturación</h2>
        <p className="text-muted-foreground text-xs">
          {subscription ? currentLine(subscription) : 'Cargando…'}
        </p>
      </div>

      <div className="space-y-5 p-5">
        {returned === 'ok' ? (
          <output className="bg-accent text-accent-foreground block rounded-lg px-4 py-3 text-sm">
            {activated
              ? 'Pago recibido. Tu plan ya está activo, gracias.'
              : 'Estamos confirmando el pago con el banco. En unos segundos verás tu plan activo; no hace falta repetir el pago.'}
          </output>
        ) : null}
        {returned === 'cancelado' ? (
          <output className="bg-accent text-accent-foreground block rounded-lg px-4 py-3 text-sm">
            El pago no se ha completado y no se ha cobrado nada. Puedes volver a intentarlo cuando
            quieras.
          </output>
        ) : null}
        <PaymentHistory tenantId={tenantId} companyName={companyName} subscription={subscription} />
        <hr className="border-border" />
        {onTrial ? (
          <div className="bg-accent text-accent-foreground rounded-lg px-4 py-3 text-sm">
            <p className="font-medium">
              {subscription.canWrite
                ? `Estás probando el plan Empresa completo durante ${TRIAL_DAYS} días, gratis.`
                : 'Tu prueba gratuita ha terminado.'}
            </p>
            <p className="mt-1 text-xs">
              {needed
                ? `Ahora sois ${members} ${members === 1 ? 'persona' : 'personas'}: te encaja el plan ${needed.name}. `
                : members <= MAX_SCALE_PLAN_MEMBERS
                  ? `Ahora sois ${members} personas: os encaja Ábaco Escala. `
                  : `Ahora sois más de 100 personas: podemos preparar un plan personalizado. `}
              Si prefieres uno más pequeño, quita el acceso a las personas que sobren en Equipo.
            </p>
          </div>
        ) : null}

        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Elige según el tamaño y la forma de trabajar</h3>
          <p className="text-muted-foreground text-sm">
            Todos los planes incluyen las mismas funciones; cada tramo orienta sobre la capacidad
            adecuada. El total cuenta a quien administra la empresa.
          </p>
        </div>

        {members <= MAX_SCALE_PLAN_MEMBERS ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label htmlFor="billing-member-count" className="text-sm font-medium">
                  Personas con acceso
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="billing-member-count"
                    type="number"
                    min={minimumMembers}
                    max={MAX_SCALE_PLAN_MEMBERS}
                    step={1}
                    value={selectedMemberCount}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber
                      if (Number.isFinite(value))
                        setSelectedMembers(
                          Math.max(
                            minimumMembers,
                            Math.min(MAX_SCALE_PLAN_MEMBERS, Math.round(value)),
                          ),
                        )
                    }}
                    className="border-border bg-background h-10 w-20 rounded-md border px-3 text-center text-sm"
                  />
                  <span className="text-muted-foreground text-sm">personas</span>
                </div>
              </div>
              <input
                type="range"
                aria-label="Ajustar el número de personas"
                aria-describedby="billing-member-count-help"
                min={minimumMembers}
                max={MAX_SCALE_PLAN_MEMBERS}
                step={1}
                value={selectedMemberCount}
                onChange={(event) => setSelectedMembers(Number(event.currentTarget.value))}
                className="accent-primary w-full cursor-pointer"
              />
              <div
                className="text-muted-foreground flex justify-between text-xs"
                aria-hidden="true"
              >
                <span>{minimumMembers} personas</span>
                <span>{MAX_SCALE_PLAN_MEMBERS} personas</span>
              </div>
              <p id="billing-member-count-help" className="text-muted-foreground text-xs">
                El mínimo corresponde a las personas que ya tienen acceso. Para reducirlo, primero
                tendrás que quitar accesos del equipo.
              </p>
            </div>

            <div className="space-y-4">
              <Tabs
                selectedKey={interval}
                onSelectionChange={(key) => setInterval(key as Interval)}
              >
                <TabsList aria-label="Periodo de pago" className="w-full sm:w-fit">
                  <TabsTrigger id="year" className="flex-1 sm:flex-none">
                    Anual
                    <span className="bg-primary/10 text-primary rounded-full px-1.5 text-[11px]">
                      2 meses gratis
                    </span>
                  </TabsTrigger>
                  <TabsTrigger id="month" className="flex-1 sm:flex-none">
                    Mensual
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {planCatalog.map((plan) => (
                  <PlanOptionCard
                    key={plan.id}
                    plan={plan}
                    interval={interval}
                    members={selectedMemberCount}
                    recommended={recommended === plan.id}
                    current={subscribed === true && subscription?.plan === plan.id}
                    busy={busy !== null}
                    onChoose={() =>
                      void go(plan.id, () =>
                        subscription?.status === 'active'
                          ? changePlan(tenantId, plan.id, interval)
                          : startCheckout(tenantId, plan.id, interval),
                      )
                    }
                  />
                ))}
                <ScalePlanCard
                  members={selectedMemberCount}
                  interval={interval}
                  recommended={recommendedScale}
                />
                <CustomPlanCard />
              </div>
            </div>
          </div>
        ) : (
          <CustomPlanCard />
        )}

        <ul className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-2">
          {includedInEveryPlan.map((item) => (
            <li key={item}>✓ {item}</li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          Precios sin IVA (se añade el 21 %). Pago con tarjeta, renovación automática. Sin
          permanencia: cancelas cuando quieras y sigues hasta el final del periodo pagado. Un cambio
          de plan se aplica en la próxima renovación.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {error ? <output className="text-destructive text-sm">{error}</output> : <span />}
          {subscription?.status === 'active' ? (
            <Button
              variant="outline"
              isDisabled={busy !== null}
              onPress={() =>
                void go('cancel', () =>
                  subscription.cancelAtPeriodEnd ? resumePlan(tenantId) : cancelPlan(tenantId),
                )
              }
            >
              {subscription.cancelAtPeriodEnd
                ? 'Mantener mi plan'
                : 'Cancelar al final del periodo'}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
