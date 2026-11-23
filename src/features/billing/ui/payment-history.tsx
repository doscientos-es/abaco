import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'

import { downloadTextFile } from '@/shared/domain/csv'

import {
  billingCatalogQuery,
  billingPreviewQuery,
  paymentsQuery,
  type Payment,
  type Subscription,
} from '../application/billing-actions'
import { billingVatLabel, formatEuros, planLabel, type CatalogRate } from '../domain/plans'

const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
const cents = (value: number) => formatEuros(value / 100)
const statusLabel = { succeeded: 'Pagado', failed: 'No cobrado', pending: 'En proceso' } as const
const statusStyle = {
  succeeded: 'bg-primary/10 text-primary',
  failed: 'bg-destructive/10 text-destructive',
  pending: 'bg-muted text-muted-foreground',
} as const

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function concept(payment: Payment, rates: CatalogRate[] | undefined) {
  const name = planLabel(payment.plan, rates)
  const kind = payment.kind === 'first' ? 'Alta' : 'Renovación'
  return `${kind} · plan ${name} ${payment.period === 'year' ? 'anual' : 'mensual'}`
}

/** A printable receipt (open the file and print it to PDF). VAT is already inside the charged amount. */
function downloadReceipt(payment: Payment, companyName: string, description: string) {
  const base =
    payment.netCents ?? Math.round((payment.amountCents * 100) / (100 + payment.vatPercent))
  const date = day.format(payment.settledAt ?? payment.createdAt)
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Justificante de pago ${escapeHtml(payment.order)}</title>
<body style="font-family:Arial,sans-serif;max-width:560px;margin:40px auto;color:#1a1a1a">
<h1 style="font-size:20px">Justificante de pago · Ábaco</h1>
<p>Cliente: <strong>${escapeHtml(companyName)}</strong><br>Fecha: ${date}<br>Referencia de la operación: ${escapeHtml(payment.order)}</p>
<table style="width:100%;border-collapse:collapse"><tr><td>${escapeHtml(description)}</td><td style="text-align:right">${cents(base)}</td></tr>
<tr><td>IVA (${payment.vatPercent} %)</td><td style="text-align:right">${cents(payment.amountCents - base)}</td></tr>
<tr><td style="border-top:1px solid #999"><strong>Total de la factura</strong></td><td style="border-top:1px solid #999;text-align:right"><strong>${cents(payment.amountCents)}</strong></td></tr>
${
  payment.referralCreditCents !== null
    ? `<tr><td>Descuento por referidos incluido en el total</td><td style="text-align:right">${cents(payment.referralCreditCents)}</td></tr>`
    : ''
}</table>
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
  const {
    data: payments,
    isPending,
    isError,
    fetchStatus,
    refetch,
  } = useQuery(paymentsQuery(tenantId))
  const preview = useQuery(billingPreviewQuery(tenantId))
  const { data: rates } = useQuery(billingCatalogQuery)
  const active =
    subscription &&
    !subscription.isComplimentary &&
    ['active', 'past_due'].includes(subscription.status)
  const next = preview.data?.next
  const periodEnd = subscription?.currentPeriodEnd ?? null
  const willRenew = Boolean(active && !subscription.cancelAtPeriodEnd && periodEnd && next)
  const current = preview.data?.current

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="border-border rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">Plan contratado</dt>
          <dd className="font-medium">
            {subscription?.isComplimentary
              ? 'Cortesía'
              : active && current
                ? `${planLabel(current.plan, rates)} · hasta ${current.seats} · ${current.period === 'year' ? 'anual' : 'mensual'}`
                : active
                  ? 'Pendiente de verificar'
                  : 'Ninguno todavía'}
          </dd>
        </div>
        <div className="border-border rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">Próximo cobro</dt>
          <dd className="font-medium">
            {active && preview.data?.pending
              ? 'Pago en verificación'
              : active && preview.isError
                ? 'No se pudo verificar'
                : active && !preview.data
                  ? 'Consultando…'
                  : subscription?.status === 'past_due' && next
                    ? `Cuota pendiente: ${cents(next.amount_cents)} ${billingVatLabel(next.vat_percent)}`
                    : willRenew && periodEnd && next
                      ? `${cents(next.amount_cents)} ${billingVatLabel(next.vat_percent)} el ${day.format(periodEnd)}`
                      : active && subscription.cancelAtPeriodEnd
                        ? `Ninguno: termina el ${periodEnd ? day.format(periodEnd) : 'periodo'}`
                        : 'Ninguno'}
          </dd>
        </div>
      </dl>
      {subscription?.nextPlan && next ? (
        <p className="text-muted-foreground text-xs">
          {active ? 'Cambio programado' : 'Oferta acordada'}: {planLabel(next.plan, rates)} · hasta{' '}
          {next.seats} · {cents(next.amount_cents)} {billingVatLabel(next.vat_percent)}{' '}
          {next.period === 'year' ? 'al año' : 'al mes'}.
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
          <p className="text-muted-foreground text-sm">
            Todavía no has hecho ningún pago. Aquí aparecerán con su justificante.
          </p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-lg border text-sm">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <div>
                  <p className="font-medium">{concept(p, rates)}</p>
                  <p className="text-muted-foreground text-xs">
                    {day.format(p.settledAt ?? p.createdAt)} · ref. {p.order}
                  </p>
                  {p.status === 'succeeded' &&
                  p.referralCreditCents !== null &&
                  p.referralCreditCents > 0 &&
                  p.chargedCents !== null ? (
                    <p className="text-muted-foreground text-xs">
                      Descuento por referidos {cents(p.referralCreditCents)}
                    </p>
                  ) : null}
                  {p.status === 'succeeded' &&
                    (p.invoicePortalUrl && p.invoiceNumber ? (
                      <a
                        className="text-primary text-xs underline"
                        href={p.invoicePortalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Factura {p.invoiceNumber}
                      </a>
                    ) : (
                      <p className="text-muted-foreground text-xs">Factura aún no disponible</p>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusStyle[p.status]}`}>
                    {statusLabel[p.status]}
                  </span>
                  <span className="w-24 text-right font-medium">{cents(p.amountCents)}</span>
                  {p.status === 'succeeded' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => downloadReceipt(p, companyName, concept(p, rates))}
                    >
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
