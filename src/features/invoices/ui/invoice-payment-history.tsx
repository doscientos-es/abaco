import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useSession } from '@/features/auth'
import { formatEuros, parseEuros } from '@/shared/domain/money'
import { TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import { refundInvoicePayment } from '../application/invoice-actions'
import {
  loadInvoicePaymentHistory,
  type InvoicePaymentRecord,
} from '../application/invoice-payment-actions'

const methodLabel: Record<InvoicePaymentRecord['payment_method'], string> = {
  unspecified: 'Sin especificar',
  transfer: 'Transferencia',
  cash: 'Efectivo',
  card: 'Tarjeta',
  other: 'Otro',
}

export function InvoicePaymentHistory({
  tenantId,
  invoiceId,
}: {
  tenantId: string
  invoiceId: string
}) {
  const session = useSession()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<InvoicePaymentRecord | null>(null)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const canManage =
    session?.tenantId === tenantId && ['owner', 'admin'].includes(session.role ?? '')
  const query = useQuery({
    queryKey: ['invoice-payment-history', tenantId, invoiceId],
    queryFn: () => loadInvoicePaymentHistory(tenantId, invoiceId),
    enabled: canManage,
  })
  if (!canManage) return null
  const refundedByPayment = new Map<string, number>()
  for (const refund of query.data?.refunds ?? []) {
    refundedByPayment.set(
      refund.payment_id,
      (refundedByPayment.get(refund.payment_id) ?? 0) + refund.amount_cents,
    )
  }
  const available = selected ? selected.amount_cents - (refundedByPayment.get(selected.id) ?? 0) : 0
  const refundCents = parseEuros(amount)

  async function submitRefund() {
    if (!selected || busy || refundCents <= 0 || refundCents > available) return
    setBusy(true)
    try {
      const result = await refundInvoicePayment(selected.id, refundCents, date, reason)
      if (!result.ok) throw new Error(result.error)
      await queryClient.invalidateQueries({
        queryKey: ['invoice-payment-history', tenantId, invoiceId],
      })
      setSelected(null)
      setAmount('')
      setReason('')
      toast.success('Reembolso registrado; la factura emitida se conserva')
    } catch (error) {
      toast.error('No se pudo registrar el reembolso', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 border-t pt-4" aria-labelledby="payment-history-title">
      <h3 id="payment-history-title" className="text-sm font-semibold">
        Cobros y reembolsos
      </h3>
      {query.isPending ? <output>Cargando movimientos…</output> : null}
      {query.isError ? <p role="alert">{query.error.message}</p> : null}
      {query.data?.payments.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aún no hay cobros registrados.</p>
      ) : null}
      <ul className="space-y-3">
        {query.data?.payments.map((payment) => {
          const refunded = refundedByPayment.get(payment.id) ?? 0
          const remaining = payment.amount_cents - refunded
          return (
            <li key={payment.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{formatEuros(payment.amount_cents)}</p>
                  <p className="text-muted-foreground text-xs">
                    {payment.payment_date} · {methodLabel[payment.payment_method]}
                  </p>
                </div>
                {remaining > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={() => {
                      setSelected(payment)
                      setAmount((remaining / 100).toFixed(2))
                    }}
                  >
                    Reembolsar
                  </Button>
                ) : null}
              </div>
              {refunded > 0 ? (
                <p className="mt-2 text-xs">Reembolsado: {formatEuros(refunded)}</p>
              ) : null}
              {query.data?.refunds
                .filter((refund) => refund.payment_id === payment.id)
                .map((refund) => (
                  <p key={refund.id} className="text-muted-foreground mt-1 text-xs">
                    {refund.refund_date} · −{formatEuros(refund.amount_cents)} · {refund.reason}
                  </p>
                ))}
            </li>
          )
        })}
      </ul>
      <FormDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
            setAmount('')
            setReason('')
          }
        }}
        title="Reembolsar un cobro"
        description={`Disponible para reembolsar: ${formatEuros(available)}`}
        submitLabel={busy ? 'Registrando…' : 'Registrar reembolso'}
        submitDisabled={
          busy ||
          !Number.isSafeInteger(refundCents) ||
          refundCents <= 0 ||
          refundCents > available ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          reason.trim().length < 1 ||
          reason.trim().length > 500
        }
        onSubmit={() => void submitRefund()}
      >
        <TextField label="Importe (€)" value={amount} onChange={setAmount} placeholder="0,00" />
        <TextField
          label="Fecha"
          type="date"
          value={date}
          onChange={setDate}
          placeholder="dd/mm/aaaa"
        />
        <TextField
          label="Motivo"
          className="sm:col-span-2"
          value={reason}
          onChange={setReason}
          placeholder="Motivo del reembolso"
          maxLength={500}
        />
      </FormDialog>
    </section>
  )
}
