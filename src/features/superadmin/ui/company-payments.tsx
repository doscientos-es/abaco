import { Badge, MetricCard } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { formatEuros } from '@/shared/domain/money'

import {
  platformPaymentsQuery,
  platformPaymentSummaryQuery,
  type PlatformPayment,
} from '../application/superadmin-queries'
import { platformPageSize } from '../domain/platform-navigation'
import {
  billingPeriodLabel,
  formatPlatformDate,
  PlatformMessage,
  PlatformPagination,
  platformPlanLabel,
} from './platform-ui'

const invoiceStatus: Record<string, string> = {
  pending: 'Pendiente de emisión',
  retrying: 'Error de integración · reintento programado',
  fiscal_pending: 'Pendiente de respuesta de AEAT',
  fiscal_review: 'Revisar rechazo fiscal en Backoffice',
  invoice_review: 'Revisar factura en Backoffice',
  email_pending: 'Correo pendiente · reintento programado',
  email_review: 'Comprobar entrega antes de reenviar',
  sent: 'Correo aceptado por el proveedor',
}

const paymentStatus = {
  succeeded: { label: 'Cobrado', variant: 'success' },
  failed: { label: 'Fallido', variant: 'danger' },
  pending: { label: 'Pendiente', variant: 'warning' },
} as const

export function CompanyPayments({ tenantId }: { tenantId: string }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const payments = useQuery(platformPaymentsQuery(tenantId, (page - 1) * platformPageSize, status))
  const summary = useQuery(platformPaymentSummaryQuery(tenantId))

  return (
    <section aria-labelledby="platform-payments" className="space-y-4">
      <h2 id="platform-payments" className="text-lg font-semibold">
        Pagos
      </h2>
      {summary.isError ? (
        <PlatformMessage
          title="No se pudo cargar el resumen de pagos."
          onRetry={() => void summary.refetch()}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            label="Cobrados"
            value={summary.data?.succeeded_count}
            description={
              summary.data ? `${formatEuros(summary.data.succeeded_cents)} en total` : undefined
            }
            loading={summary.isPending}
          />
          <MetricCard
            label="Pendientes"
            value={summary.data?.pending_count}
            loading={summary.isPending}
          />
          <MetricCard
            label="Fallidos"
            value={summary.data?.failed_count}
            loading={summary.isPending}
          />
        </div>
      )}
      <div className="border-border bg-card rounded-xl border">
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h3 className="font-semibold">Historial de cobros</h3>
          <div className="flex items-center gap-2">
            <label htmlFor="platform-payment-status" className="text-muted-foreground text-sm">
              Estado
            </label>
            <select
              id="platform-payment-status"
              className="border-border bg-background focus-visible:outline-ring min-h-10 rounded-md border px-2 text-sm focus-visible:outline-2"
              value={status}
              onChange={(event) => {
                setStatus(event.currentTarget.value)
                setPage(1)
              }}
            >
              <option value="">Todos</option>
              {Object.entries(paymentStatus).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {payments.isPending ? (
          <output className="text-muted-foreground block p-4 text-sm">Cargando pagos…</output>
        ) : null}
        {payments.isError ? (
          <PlatformMessage
            title="No se pudieron cargar los pagos."
            onRetry={() => void payments.refetch()}
          />
        ) : null}
        {payments.data?.length ? (
          <ul className="divide-border divide-y">
            {payments.data.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} />
            ))}
          </ul>
        ) : payments.data ? (
          <PlatformMessage
            title={
              status
                ? 'No hay pagos con este estado en esta página.'
                : 'No hay pagos en esta página.'
            }
          />
        ) : null}
        {payments.data ? (
          <PlatformPagination page={page} count={payments.data.length} onChange={setPage} />
        ) : null}
      </div>
    </section>
  )
}

function PaymentRow({ payment }: { payment: PlatformPayment }) {
  const { label, variant } = paymentStatus[payment.status]
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm">
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">
          {payment.kind === 'renewal' ? 'Renovación' : 'Primer cobro'} ·{' '}
          {formatPlatformDate(payment.created_at)}
        </p>
        <p className="text-muted-foreground">
          {platformPlanLabel(payment.plan)} · {billingPeriodLabel(payment.period)}
        </p>
        {payment.status === 'succeeded' ? (
          <p className="text-muted-foreground text-xs">
            {payment.invoice_number ? `Factura ${payment.invoice_number}` : 'Factura'} ·{' '}
            {invoiceStatus[payment.invoice_status ?? ''] ?? 'Sin solicitud de factura'}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold tabular-nums">
          {formatEuros(payment.amount_cents)}{' '}
          <span className="text-muted-foreground text-xs font-normal">IVA incluido</span>
        </span>
        <Badge variant={variant} icon={false}>
          {label}
        </Badge>
      </div>
    </li>
  )
}
