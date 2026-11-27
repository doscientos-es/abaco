import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { planLabel, type CatalogRate } from '@/features/billing'
import { formatEuros } from '@/shared/domain/money'

import {
  platformPaymentsQuery,
  platformPaymentSummaryQuery,
  type PlatformCompany,
  type PlatformPayment,
} from '../application/superadmin-queries'
import {
  companySectionSearch,
  platformPageSize,
  type PlatformSearch,
} from '../domain/platform-navigation'
import { PlatformField, PlatformSelect } from './platform-form-field'
import {
  billingPeriodLabel,
  formatPlatformDate,
  invoiceStatusLabel,
  PlatformLoading,
  PlatformMessage,
  platformPanelClass,
  PlatformPagination,
  platformActionClass,
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

export function CompanyCollectionOverview({
  company,
  search,
}: {
  company: PlatformCompany
  search: PlatformSearch
}) {
  const summary = useQuery(platformPaymentSummaryQuery(company.id))
  const latest = useQuery({
    ...platformPaymentsQuery(company.id, 0, ''),
    enabled: !company.is_complimentary,
  })
  const payment = latest.data?.[0]
  const checkedAt = Math.max(summary.dataUpdatedAt, latest.dataUpdatedAt)
  const overdue =
    company.subscription_status === 'past_due' ||
    (company.subscription_status === 'active' &&
      Boolean(company.current_period_end) &&
      Date.parse(company.current_period_end ?? '') <= checkedAt)
  const failed = payment?.status === 'failed'
  const pending = payment?.status === 'pending'
  const problem = company.is_complimentary
    ? null
    : failed && company.subscription_status !== 'canceled'
      ? {
          title: payment.kind === 'renewal' ? 'Falló el cobro automático' : 'Falló el primer cobro',
          variant: 'destructive',
        }
      : pending
        ? { title: 'Pago pendiente de confirmación', variant: 'warning' }
        : overdue
          ? { title: 'Renovación vencida sin confirmar', variant: 'destructive' }
          : null

  return (
    <div className={`${platformPanelClass} space-y-3 p-3 sm:p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <dl>
          <dt className="text-muted-foreground text-sm">Total cobrado</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {summary.isError
              ? 'No disponible'
              : summary.data
                ? formatEuros(summary.data.succeeded_cents)
                : '…'}
          </dd>
        </dl>
        <Link
          to="/superadmin"
          search={companySectionSearch(search, 'pagos')}
          className={platformActionClass}
        >
          Ver historial de pagos
        </Link>
      </div>
      {summary.isError ? (
        <PlatformMessage
          title="No se pudo calcular el total cobrado."
          onRetry={() => void summary.refetch()}
        />
      ) : summary.data ? (
        <p className="text-muted-foreground text-sm">
          {summary.data.succeeded_count}{' '}
          {summary.data.succeeded_count === 1 ? 'cobro confirmado' : 'cobros confirmados'} · IVA
          incluido
        </p>
      ) : (
        <PlatformLoading>Cargando total cobrado…</PlatformLoading>
      )}
      {problem ? (
        <Alert variant={problem.variant === 'destructive' ? 'destructive' : 'warning'}>
          <AlertTitle>{problem.title}</AlertTitle>
          <AlertDescription>
            {payment && (failed || pending)
              ? `Último intento: ${formatEuros(payment.amount_cents)} · ${formatPlatformDate(payment.created_at)}.`
              : 'El periodo terminó y no consta una renovación confirmada.'}
          </AlertDescription>
        </Alert>
      ) : null}
      {latest.isError && !company.is_complimentary ? (
        <PlatformMessage
          title="No se pudo comprobar el estado del último cobro."
          onRetry={() => void latest.refetch()}
        />
      ) : null}
    </div>
  )
}

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
          <PaymentSummary label="Total cobrado" value={formatEuros(summary.data.succeeded_cents)} />
          <PaymentSummary label="Cobros confirmados" value={summary.data.succeeded_count} />
          <PaymentSummary label="Pendientes" value={summary.data.pending_count} />
          <PaymentSummary label="Intentos fallidos" value={summary.data.failed_count} />
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
        {!payments.isError && payments.data?.length ? (
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
        ) : !payments.isError && payments.data ? (
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
