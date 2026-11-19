import { Button } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import {
  ModuleSubscriptions,
  moduleSubscriptionsQuery,
  tenantModulesQuery,
} from '@/features/product-modules'

import {
  acceptBillingTerms,
  billingCatalogQuery,
  billingPreviewQuery,
  cancelPlan,
  resumePlan,
  memberCountQuery,
  submitToRedsys,
  subscriptionQuery,
  undoPlanChange,
  type BillingResult,
  type Subscription,
} from '../application/billing-actions'
import {
  billingVatLabel,
  formatEuros,
  planLabel,
  STANDARD_BILLING_VAT,
  withModulePrice,
  type BillingTerms,
} from '../domain/plans'
import { PaymentHistory } from './payment-history'
import { PricingCatalog } from './pricing-catalog'
import { SubscriptionBillingProfileForm } from './subscription-billing-profile-form'

const dateFormat = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function currentLine(sub: Subscription, name: string): string {
  const until = sub.currentPeriodEnd ? dateFormat.format(sub.currentPeriodEnd) : ''
  if (sub.status === 'trialing' && sub.canWrite) {
    return `Prueba gratuita: te quedan ${sub.trialDaysLeft} ${sub.trialDaysLeft === 1 ? 'día' : 'días'}.`
  }
  if (sub.status === 'trialing')
    return 'Tu prueba ha terminado. Tus datos están a salvo, solo en lectura.'
  if (sub.status === 'canceled') return 'Sin plan activo. Tus datos están a salvo, solo en lectura.'
  if (sub.status === 'past_due')
    return `Plan ${name}: no hemos podido cobrar la última cuota. Puedes reintentar el pago con tarjeta.`
  if (sub.cancelAtPeriodEnd)
    return `Plan ${name}: se cancela el ${until}. Hasta entonces sigue todo igual.`
  return `Plan ${name}, ${sub.interval === 'year' ? 'anual' : 'mensual'}. Próxima renovación: ${until}.`
}

/** Plan and payment. Only rendered for admins. */
export function BillingSection({
  tenantId,
  companyName,
}: {
  tenantId: string
  companyName: string
}) {
  const subscriptionState = useQuery(subscriptionQuery(tenantId))
  const subscription = subscriptionState.data
  const preview = useQuery(billingPreviewQuery(tenantId))
  const { data: rates } = useQuery(billingCatalogQuery)
  const team = useQuery(memberCountQuery(tenantId))
  const [selection, setSelection] = useState<{
    terms: BillingTerms
    action: 'checkout' | 'change' | 'retry'
  } | null>(null)
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
      void queryClient.invalidateQueries({ queryKey: ['billing-preview', tenantId] })
      void queryClient.invalidateQueries({ queryKey: moduleSubscriptionsQuery(tenantId).queryKey })
      void queryClient.invalidateQueries({ queryKey: tenantModulesQuery(tenantId).queryKey })
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
      void queryClient.invalidateQueries({ queryKey: ['billing-preview', tenantId] })
      void queryClient.invalidateQueries({ queryKey: moduleSubscriptionsQuery(tenantId).queryKey })
      void queryClient.invalidateQueries({ queryKey: tenantModulesQuery(tenantId).queryKey })
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
      if (result.ok) setSelection(null)
      else setError(result.message)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['subscription', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-preview', tenantId] }),
      ])
    } catch {
      setError('No se pudo completar la operación. Inténtalo de nuevo.')
    } finally {
      setBusy(null)
    }
  }

  const pending = preview.data?.pending === true
  const upcoming = preview.data?.next
  const fixedNet = preview.data?.fixed_net_cents
  const fixedPrice =
    upcoming && fixedNet != null ? { period: upcoming.period, netCents: fixedNet } : undefined
  const active = subscription?.status === 'active'
  const pastDue = subscription?.status === 'past_due'
  const scheduled = Boolean(subscription?.nextPlan && upcoming)
  const managedChange = scheduled && preview.data?.next_managed === true
  const members = Math.max(1, team.data ?? 1)
  const ready = Boolean(
    subscription && preview.data && team.data !== undefined && !pending && !busy,
  )

  if (subscription?.isComplimentary) {
    return (
      <section className="border-border bg-card rounded-xl border px-5 py-4">
        <h2 className="text-sm font-semibold">Suscripción de Ábaco</h2>
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
        <h2 className="text-sm font-semibold">Suscripción de Ábaco</h2>
        <p className="text-muted-foreground text-xs">
          {subscription
            ? currentLine(subscription, planLabel(subscription.plan, rates))
            : 'Cargando…'}
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
            No se ha confirmado el pago. Si sigue pendiente de verificación, no lo repitas.
          </output>
        ) : null}
        <PaymentHistory tenantId={tenantId} companyName={companyName} subscription={subscription} />
        <SubscriptionBillingProfileForm key={tenantId} tenantId={tenantId} />
        <hr className="border-border" />
        {subscriptionState.isError || team.isError || preview.isError ? (
          <div role="alert" className="space-y-2">
            <p>No se pudo verificar tu suscripción o el número de personas con acceso.</p>
            <Button
              variant="outline"
              onPress={() =>
                void Promise.all([subscriptionState.refetch(), team.refetch(), preview.refetch()])
              }
            >
              Reintentar
            </Button>
          </div>
        ) : null}
        {pending ? (
          <output className="block">
            Hay un pago pendiente de verificar. No repitas el pago. Si el estado no cambia, contacta
            con Ábaco.
          </output>
        ) : null}
        {upcoming && !subscription?.cancelAtPeriodEnd && (active || scheduled || pastDue) ? (
          <p>
            {active ? 'Próxima renovación' : 'Importe a pagar'}:{' '}
            <strong>
              {formatEuros(upcoming.amount_cents / 100)} {billingVatLabel(upcoming.vat_percent)}
            </strong>{' '}
            por {upcoming.period === 'year' ? 'año' : 'mes'}.
            {upcoming.module_net_cents ? (
              <> Incluye {formatEuros(upcoming.module_net_cents / 100)} en módulos, sin IVA.</>
            ) : null}
          </p>
        ) : null}
        {upcoming && (pastDue || (!active && scheduled)) ? (
          <Button
            isDisabled={!ready || members > upcoming.seats}
            onPress={() =>
              setSelection({ terms: upcoming, action: pastDue ? 'retry' : 'checkout' })
            }
          >
            {pastDue ? 'Reintentar el pago con tarjeta' : 'Contratar mi oferta acordada'}
          </Button>
        ) : null}
        {active && managedChange ? (
          <p className="text-muted-foreground text-sm">
            Ábaco ha programado las próximas condiciones. Contacta con soporte para modificarlas.
          </p>
        ) : active && scheduled ? (
          <Button
            variant="outline"
            isDisabled={!ready}
            onPress={() => void go('undo', () => undoPlanChange(tenantId))}
          >
            Retirar el cambio programado
          </Button>
        ) : null}
        {subscription && preview.data ? (
          <ModuleSubscriptions
            tenantId={tenantId}
            active={active}
            blocked={
              pending ||
              pastDue ||
              subscription.cancelAtPeriodEnd ||
              Boolean(busy) ||
              Boolean(selection)
            }
            onChanged={() =>
              queryClient.invalidateQueries({ queryKey: ['billing-preview', tenantId] })
            }
          />
        ) : null}
        <PricingCatalog
          actualMembers={members}
          showModuleCatalog={false}
          vatPercent={preview.data?.vat_percent ?? STANDARD_BILLING_VAT}
          fixedPrice={fixedPrice}
          renderAction={(terms, plan) => {
            const current = preview.data?.current
            const same =
              active &&
              current?.plan === terms.plan &&
              current.seats === terms.seats &&
              current.period === terms.period
            const fits = members <= terms.seats
            return (
              <Button
                className="w-full"
                variant={same ? 'outline' : 'default'}
                isDisabled={
                  !ready ||
                  Boolean(selection) ||
                  same ||
                  !fits ||
                  pastDue ||
                  scheduled ||
                  subscription?.cancelAtPeriodEnd === true
                }
                onPress={() => {
                  const extras =
                    terms.period === 'year'
                      ? preview.data?.module_yearly_cents
                      : preview.data?.module_monthly_cents
                  setSelection({
                    terms: withModulePrice(terms, extras ?? 0),
                    action: active ? 'change' : 'checkout',
                  })
                }}
              >
                {same ? 'Tu plan actual' : fits ? `Elegir ${plan.name}` : 'No cubre a tu equipo'}
              </Button>
            )
          }}
        />
        {selection ? (
          <section
            aria-label="Confirmar importe de suscripción"
            className="border-primary space-y-3 rounded-lg border p-4"
            aria-live="polite"
          >
            <h3 className="font-semibold">
              Confirmar {planLabel(selection.terms.plan, rates)} · hasta {selection.terms.seats}{' '}
              personas
            </h3>
            <p>
              {formatEuros(selection.terms.net_cents / 100)} sin IVA ·{' '}
              <strong>
                {formatEuros(selection.terms.amount_cents / 100)}{' '}
                {billingVatLabel(selection.terms.vat_percent)}
              </strong>{' '}
              por {selection.terms.period === 'year' ? 'año' : 'mes'}.
            </p>
            {selection.terms.module_net_cents ? (
              <p className="text-sm">
                Incluye {formatEuros(selection.terms.module_net_cents / 100)} en módulos, sin IVA.
              </p>
            ) : null}
            <p className="text-muted-foreground text-sm">
              {selection.action === 'change'
                ? 'El cambio se aplica en la próxima renovación, sin cobro inmediato.'
                : 'Continuarás en Redsys para confirmar el pago con tarjeta.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                isDisabled={!ready}
                onPress={() =>
                  void go('confirm', () =>
                    acceptBillingTerms(tenantId, selection.action, selection.terms),
                  )
                }
              >
                {selection.action === 'change' ? 'Programar cambio' : 'Continuar a Redsys'}
              </Button>
              <Button
                variant="outline"
                isDisabled={busy !== null}
                onPress={() => setSelection(null)}
              >
                Volver
              </Button>
            </div>
          </section>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Pago con tarjeta y renovación automática. Puedes cancelar al final del periodo pagado.
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
