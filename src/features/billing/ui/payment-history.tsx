import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'

import { downloadTextFile } from '@/shared/domain/csv'

import { paymentsQuery, type Payment, type Subscription } from '../application/billing-actions'
import { formatEuros, planCatalog, planInfo } from '../domain/plans'

const VAT_PERCENT = 21
const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
const cents = (value: number) => formatEuros(value / 100)
const statusLabel = { succeeded: 'Pagado', failed: 'No cobrado', pending: 'En proceso' } as const
const statusStyle = {
  succeeded: 'bg-primary/10 text-primary',
  failed: 'bg-destructive/10 text-destructive',
  pending: 'bg-muted text-muted-foreground',
} as const

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function concept(payment: Payment) {
  const name = planInfo(payment.plan)?.name ?? payment.plan
  const kind = payment.kind === 'first' ? 'Alta' : 'Renovación'
  return `${kind} · plan ${name} ${payment.period === 'year' ? 'anual' : 'mensual'}`
}

/** A printable receipt (open the file and print it to PDF). VAT is already inside the charged amount. */
function downloadReceipt(payment: Payment, companyName: string) {
  const base = Math.round((payment.amountCents * 100) / (100 + VAT_PERCENT))
  const date = day.format(payment.settledAt ?? payment.createdAt)
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Justificante de pago ${escapeHtml(payment.order)}</title>
<body style="font-family:Arial,sans-serif;max-width:560px;margin:40px auto;color:#1a1a1a">
<h1 style="font-size:20px">Justificante de pago · Ábaco</h1>
<p>Cliente: <strong>${escapeHtml(companyName)}</strong><br>Fecha: ${date}<br>Referencia de la operación: ${escapeHtml(payment.order)}</p>
<table style="width:100%;border-collapse:collapse"><tr><td>${escapeHtml(concept(payment))}</td><td style="text-align:right">${cents(base)}</td></tr>
<tr><td>IVA (${VAT_PERCENT} %)</td><td style="text-align:right">${cents(payment.amountCents - base)}</td></tr>
<tr><td style="border-top:1px solid #999"><strong>Total pagado con tarjeta</strong></td><td style="border-top:1px solid #999;text-align:right"><strong>${cents(payment.amountCents)}</strong></td></tr></table>
</body></html>`
  downloadTextFile(`justificante-abaco-${payment.order}.html`, html, 'text/html')
}

/** What the company has contracted, what it has paid so far and what comes next. Owner only. */
export function PaymentHistory({
  tenantId,
  companyName,
  subscription,
}: {
  tenantId: string
  companyName: string
  subscription: Subscription | undefined
}) {
  const { data: payments, isPending, isError, fetchStatus, refetch } = useQuery(paymentsQuery(tenantId))
  const paid = (payments ?? []).filter((p) => p.status === 'succeeded')
  const totalPaid = paid.reduce((sum, p) => sum + p.amountCents, 0)

  const onTrial = subscription?.status === 'trialing'
  const active = subscription && ['active', 'past_due'].includes(subscription.status)
  const nextPlan = planInfo(subscription?.nextPlan ?? subscription?.plan ?? 'trial')
  const nextInterval = subscription?.nextInterval ?? subscription?.interval
  const nextCents = nextPlan && nextInterval ? Math.round((nextInterval === 'year' ? nextPlan.yearly : nextPlan.monthly) * 121) : 0
  const periodEnd = subscription?.currentPeriodEnd ?? null
  const willRenew = Boolean(active && !subscription.cancelAtPeriodEnd && periodEnd && nextPlan && nextInterval)
  const current = planCatalog.find((p) => p.id === subscription?.plan)

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="border-border rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">Plan contratado</dt>
          <dd className="font-medium">
            {active && current ? `${current.name} · ${subscription.interval === 'year' ? 'anual' : 'mensual'}` : 'Ninguno todavía'}
          </dd>
        </div>
        <div className="border-border rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">Pagado hasta hoy (IVA incl.)</dt>
          <dd className="font-medium">
            {cents(totalPaid)} <span className="text-muted-foreground text-xs">en {paid.length} {paid.length === 1 ? 'pago' : 'pagos'}</span>
          </dd>
        </div>
        <div className="border-border rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">
            {onTrial ? 'Fin de la prueba gratuita' : 'Próximo cobro'}
          </dt>
          <dd className="font-medium">
            {onTrial && subscription
              ? day.format(subscription.trialEndsAt)
              : willRenew && periodEnd
                ? `${cents(nextCents)} el ${day.format(periodEnd)}`
                : active
                  ? `Ninguno: termina el ${periodEnd ? day.format(periodEnd) : 'periodo'}`
                  : 'Ninguno'}
          </dd>
          {onTrial ? (
            <p className="text-muted-foreground mt-1 text-xs">
              No se cobra automáticamente al terminar.
            </p>
          ) : null}
        </div>
      </dl>
      {subscription?.nextPlan && willRenew ? (
        <p className="text-muted-foreground text-xs">
          Cambio de plan pedido: a partir de la próxima renovación pasas a {nextPlan?.name}.
        </p>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Pagos realizados</h3>
        {isError || (isPending && fetchStatus === 'paused') ? (
          <div className="space-y-2">
            <p role="alert" className="text-destructive text-sm">
              {fetchStatus === 'paused'
                ? 'Sin conexión. Comprueba tu conexión para cargar el historial de pagos.'
                : 'No se pudo cargar el historial de pagos.'}
            </p>
            <Button variant="outline" size="sm" onPress={() => void refetch()}>
              Reintentar
            </Button>
          </div>
        ) : isPending ? (
          <p className="text-muted-foreground text-sm">Cargando…</p>
        ) : !payments?.length ? (
          <p className="text-muted-foreground text-sm">Todavía no has hecho ningún pago. Aquí aparecerán con su justificante.</p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-lg border text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div>
                  <p className="font-medium">{concept(p)}</p>
                  <p className="text-muted-foreground text-xs">{day.format(p.settledAt ?? p.createdAt)} · ref. {p.order}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusStyle[p.status]}`}>{statusLabel[p.status]}</span>
                  <span className="w-24 text-right font-medium">{cents(p.amountCents)}</span>
                  {p.status === 'succeeded' ? (
                    <Button variant="outline" size="sm" onPress={() => downloadReceipt(p, companyName)}>
                      Justificante
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
