import {
  Badge,
  Button,
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  toast,
} from '@doscientos/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { formatEuros } from '@/shared/domain/money'
import type { Invoice, InvoiceStatus } from '@/shared/domain/types'
import { sendDocument } from '@/shared/lib/send-document'
import { openWhatsapp } from '@/shared/lib/whatsapp'
import { useTenantData } from '@/shared/store/store'
import { PageNotFound } from '@/shared/ui/page-states'

import {
  deleteInvoice,
  invoiceOutstandingCents,
  markInvoicePaid,
  registerInvoicePayment,
  setInvoiceStatus,
} from '../application/invoice-actions'
import { InvoiceDocument } from './invoice-document'

const statusConfig: Record<InvoiceStatus, { label: string; variant: 'neutral' | 'info' | 'success' }> = {
  issued: { label: 'Emitida', variant: 'neutral' },
  sent: { label: 'Enviada', variant: 'info' },
  paid: { label: 'Cobrada', variant: 'success' },
}

export function InvoiceDetailPage({ invoiceId }: { invoiceId: string }) {
  const { invoices, clients, tenant, estimates } = useTenantData()
  const navigate = useNavigate()
  const invoice = invoices.find((i) => i.id === invoiceId)

  if (!invoice) {
    return (
      <PageNotFound
        title="Esta factura ya no existe"
        description="Puede que la hayas borrado. Vuelve a la lista para ver las que tienes."
        backTo="/facturas"
        backLabel="Ver mis facturas"
      />
    )
  }

  const client = clients.find((c) => c.id === invoice.clientId)
  const estimate = estimates.find((e) => e.id === invoice.estimateId)
  const { label, variant } = statusConfig[invoice.status]
  const today = new Date().toISOString().slice(0, 10)
  const overdue = invoice.status !== 'paid' && invoice.dueDate < today

  async function send(inv: Invoice) {
    if (!client?.email) {
      toast.error('No se envió', { description: 'El cliente no tiene email. Añádelo en Clientes y vuelve a enviar.' })
      return
    }
    const sent = await sendDocument('invoice', inv.id)
    if (sent && inv.status === 'issued') setInvoiceStatus(inv.id, 'sent')
  }

  return (
    <div className="space-y-6">
      <PageHeader className="print:hidden">
        <PageHeaderHeading>
          <PageHeaderTitle>Factura {invoice.number}</PageHeaderTitle>
          <PageHeaderDescription>
            <Link to="/facturas" className="underline-offset-4 hover:underline">
              ← Todas las facturas
            </Link>
          </PageHeaderDescription>
        </PageHeaderHeading>
        <PageHeaderActions>
          <Button onPress={() => window.print()}>Descargar PDF</Button>
          <Button variant="outline" onPress={() => void send(invoice)}>
            Enviar
          </Button>
          <Button
            variant="outline"
            onPress={() => {
              const owed = formatEuros(invoiceOutstandingCents(invoice))
              openWhatsapp(
                client?.phone ?? '',
                `Hola ${client?.name ?? ''}, te paso la factura ${invoice.number} (${invoice.concept}) por ${owed}, vence el ${invoice.dueDate}. Gracias, ${tenant.name}.`,
              )
            }}
          >
            WhatsApp
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="border-border bg-card space-y-4 rounded-lg border p-4 print:hidden">
          <div className="flex items-center justify-between gap-2">
            <Badge variant={variant}>{label}</Badge>
            <p className="text-xl font-semibold tabular-nums">{formatEuros(invoice.totalCents)}</p>
          </div>
          <dl className="space-y-3 text-sm">
            <Detail label="Concepto" value={invoice.concept} />
            <Detail label="Cliente" value={client?.name ?? 'Sin cliente'} />
            <Detail label="Emitida" value={invoice.issuedAt} />
            <Detail
              label="Vence"
              value={`${invoice.dueDate}${overdue ? ' · vencida' : ''}`}
              danger={overdue}
            />
            <div>
              <dt className="text-muted-foreground text-xs">Presupuesto</dt>
              <dd>
                {estimate ? (
                  <Link
                    to="/presupuestos/$estimateId"
                    params={{ estimateId: estimate.id }}
                    className="underline-offset-4 hover:underline"
                  >
                    {estimate.number}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
          <PaymentForm key={invoice.paidCents} invoice={invoice} />
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              isDisabled={invoice.status === 'paid'}
              onPress={() => markInvoicePaid(invoice.id)}
            >
              {invoice.status === 'paid' ? 'Cobrada' : 'Marcar como cobrada'}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              isDisabled={invoice.status === 'paid'}
              onPress={() => {
                deleteInvoice(invoice.id)
                void navigate({ to: '/facturas' })
              }}
            >
              Eliminar
            </Button>
          </div>
        </aside>

        <InvoiceDocument invoice={invoice} client={client} tenant={tenant} />
      </div>
    </div>
  )
}

/** Registers a payment; the amount starts as everything still owed, so one click closes the invoice. */
function PaymentForm({ invoice }: { invoice: Invoice }) {
  const owed = invoiceOutstandingCents(invoice)
  const [amount, setAmount] = useState((owed / 100).toFixed(2))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  if (invoice.status === 'paid') return null
  const cents = Math.round(Number(amount.replace(',', '.')) * 100)
  const valid = Number.isFinite(cents) && cents > 0

  return (
    <div className="space-y-2 border-t pt-4 text-sm">
      <dl>
        <Detail label="Cobrado hasta ahora" value={formatEuros(invoice.paidCents)} />
        <Detail label="Pendiente" value={formatEuros(owed)} />
      </dl>
      <div className="flex gap-2">
        <input
          aria-label="Importe cobrado (€)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border-input bg-background w-28 rounded-md border px-2 py-1.5 tabular-nums"
        />
        <input
          type="date"
          aria-label="Fecha del cobro"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border-input bg-background rounded-md border px-2 py-1.5"
        />
      </div>
      <Button isDisabled={!valid} onPress={() => registerInvoicePayment(invoice.id, cents, date)}>
        {cents >= owed ? 'Registrar cobro completo' : 'Registrar cobro parcial'}
      </Button>
    </div>
  )
}

function Detail({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={danger ? 'text-destructive font-medium' : undefined}>{value}</dd>
    </div>
  )
}
