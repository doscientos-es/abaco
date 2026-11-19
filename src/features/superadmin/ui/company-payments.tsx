import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { planLabel, type CatalogRate } from '@/features/billing'
import { formatEuros } from '@/shared/domain/money'

import {
  platformPaymentsQuery,
  platformPaymentSummaryQuery,
  type PlatformPayment,
} from '../application/superadmin-queries'
import { platformPageSize } from '../domain/platform-navigation'
import { PlatformField, PlatformSelect } from './platform-form-field'
import {
  billingPeriodLabel,
  formatPlatformDate,
  invoiceStatusLabel,
  PlatformLoading,
  PlatformMessage,
  platformPanelClass,
  PlatformPagination,
} from './platform-ui'

const paymentStatus = {
  succeeded: { label: 'Cobrado', variant: 'success' },
  failed: { label: 'Fallido', variant: 'danger' },
  pending: { label: 'Pendiente', variant: 'warning' },
} as const

const paymentOptions = [
  { id: 'all', label: 'Todos' },
  ...Object.entries(paymentStatus).map(([id, { label }]) => ({ id, label })),
]

export function CompanyPayments({
  tenantId,
  rates,
}: {
  tenantId: string
  rates: CatalogRate[] | undefined
}) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const payments = useQuery(platformPaymentsQuery(tenantId, (page - 1) * platformPageSize, status))
  const summary = useQuery(platformPaymentSummaryQuery(tenantId))

  return (
    <section aria-labelledby="platform-payments" className="space-y-3">
      <h2 id="platform-payments" className="text-base font-semibold">
        Pagos
      </h2>
      {summary.isError ? (
        <PlatformMessage
          title="No se pudo cargar el resumen de pagos."
          onRetry={() => void summary.refetch()}
        />
      ) : summary.data ? (
        <dl className="border-border flex flex-wrap gap-x-5 gap-y-2 rounded-lg border p-3 text-sm">
          <PaymentSummary
            label="Cobrados"
            value={`${summary.data.succeeded_count} · ${formatEuros(summary.data.succeeded_cents)}`}
          />
          <PaymentSummary label="Pendientes" value={summary.data.pending_count} />
          <PaymentSummary label="Fallidos" value={summary.data.failed_count} />
        </dl>
      ) : (
        <PlatformLoading>Cargando resumen de pagos…</PlatformLoading>
      )}
      <div className={platformPanelClass}>
        <div className="border-border flex flex-wrap items-end justify-between gap-2 border-b p-3">
          <h3 className="self-center text-sm font-semibold">Historial de cobros</h3>
          <PlatformField label="Estado del pago" className="min-w-32">
            {(control) => (
              <PlatformSelect
                {...control}
                value={status || 'all'}
                options={paymentOptions}
                onChange={(value) => {
                  setStatus(value === 'all' ? '' : value)
                  setPage(1)
                }}
              />
            )}
          </PlatformField>
        </div>
        {payments.isPending ? <PlatformLoading>Cargando pagos…</PlatformLoading> : null}
        {payments.isError ? (
          <PlatformMessage
            title="No se pudieron cargar los pagos."
            onRetry={() => void payments.refetch()}
          />
        ) : null}
        {payments.data?.length ? (
          <Table density="compact" aria-label="Historial de cobros">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Cobro</TableHead>
                <TableHead scope="col">Estado</TableHead>
                <TableHead scope="col" className="text-right">
                  Importe
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.data.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  planName={planLabel(payment.plan, rates)}
                />
              ))}
            </TableBody>
          </Table>
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

function PaymentSummary({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function PaymentRow({ payment, planName }: { payment: PlatformPayment; planName: string }) {
  const { label, variant } = paymentStatus[payment.status]
  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <p className="font-medium">
          {payment.kind === 'renewal' ? 'Renovación' : 'Primer cobro'} ·{' '}
          {formatPlatformDate(payment.created_at)}
        </p>
        <p className="text-muted-foreground text-xs">
          {planName} · {billingPeriodLabel(payment.period)}
        </p>
        {payment.status === 'succeeded' ? (
          <p className="text-muted-foreground text-xs">
            {payment.invoice_number ? `Factura ${payment.invoice_number}` : 'Factura'} ·{' '}
            {invoiceStatusLabel(payment.invoice_status, payment.invoice_number)}
          </p>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge variant={variant} icon={false}>
          {label}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <p className="font-medium tabular-nums">{formatEuros(payment.amount_cents)}</p>
        <p className="text-muted-foreground text-xs">IVA incluido</p>
      </TableCell>
    </TableRow>
  )
}
