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
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { formatEuros } from '@/shared/domain/money'
import type { Invoice, InvoiceStatus } from '@/shared/domain/types'
import { printDocument } from '@/shared/lib/print-document'
import { sendDocument } from '@/shared/lib/send-document'
import { openWhatsapp } from '@/shared/lib/whatsapp'
import { refreshStore, useTenantData } from '@/shared/store/store'
import { DocumentPreview } from '@/shared/ui/document-preview'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField } from '@/shared/ui/form'
import { PageNotFound } from '@/shared/ui/page-states'

import {
  invoiceOutstandingCents,
  registerInvoicePayment,
  type PaymentMethod,
} from '../application/invoice-actions'
import { InvoiceDocument } from './invoice-document'
import { InvoicePaymentHistory } from './invoice-payment-history'

const statusConfig: Record<
  InvoiceStatus,
  { label: string; variant: 'neutral' | 'info' | 'success' }
> = {
  issued: { label: 'Emitida', variant: 'neutral' },
  sent: { label: 'Enviada', variant: 'info' },
  paid: { label: 'Cobrada', variant: 'success' },
}

export function InvoiceDetailPage({ invoiceId }: { invoiceId: string }) {
  const { invoices, clients, tenant, estimates } = useTenantData()
  const documentRef = useRef<HTMLElement>(null)
  const [printing, setPrinting] = useState(false)
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
  const estimate = invoice.estimateId
    ? estimates.find((e) => e.id === invoice.estimateId)
    : undefined
  const { label, variant } = statusConfig[invoice.status]
  const today = new Date().toISOString().slice(0, 10)
  const overdue = invoice.status !== 'paid' && invoice.dueDate < today

  async function send(inv: Invoice) {
    if (!client?.email) {
      toast.error('No se envió', {
        description: 'El cliente no tiene email. Añádelo en Clientes y vuelve a enviar.',
      })
      return
    }
    const sent = await sendDocument('invoice', inv.id)
    if (sent) await refreshStore()
  }

  async function download() {
    if (!documentRef.current || !invoice) return
    setPrinting(true)
    try {
      await printDocument(documentRef.current, `Factura ${invoice.number}`)
    } catch {
      toast.error('No se pudo preparar el PDF', {
        description: 'Comprueba que el logo y los estilos se hayan cargado y vuelve a intentarlo.',
      })
    } finally {
      setPrinting(false)
    }
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
          <Button isDisabled={printing} onPress={() => void download()}>
            {fieldIcons.file}
            {printing ? 'Preparando PDF…' : 'Descargar PDF'}
          </Button>
          <Button variant="outline" onPress={() => void send(invoice)}>
            {fieldIcons.mail}
            Enviar por email
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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {invoice.snapshot?.source === 'migration' ? (
            <p className="bg-warning/10 text-foreground mb-3 rounded-lg px-3 py-2 text-xs print:hidden">
              Los datos de emisor y cliente de esta factura anterior se reconstruyeron durante la
              migración. Comprueba el documento original antes de reenviarla.
            </p>
          ) : null}
          <DocumentPreview>
            <InvoiceDocument
              invoice={invoice}
              client={client}
              tenant={tenant}
              estimateNumber={estimate?.number}
              documentRef={documentRef}
            />
          </DocumentPreview>
        </div>
        <aside
          aria-label="Gestión de la factura"
          className="border-border bg-card space-y-5 rounded-xl border p-5 print:hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Gestión del cobro</h2>
            <Badge variant={variant}>{label}</Badge>
          </div>
          <div className="space-y-1 border-b pb-5">
            <p className="text-muted-foreground text-xs">Importe de la factura</p>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatEuros(invoice.totalCents)}
            </p>
          </div>
          <dl className="space-y-3 text-sm">
            <Detail label="Concepto" value={invoice.concept} />
            <Detail label="Cliente" value={client?.name ?? 'Sin cliente'} />
            <Detail label="Emitida" value={invoice.issuedAt} />
            <Detail label="Estado documental" value="Emitida" />
            <Detail
              label="Entrega por email"
              value={
                invoice.emailAcceptedAt
                  ? `Aceptada por el proveedor el ${new Date(invoice.emailAcceptedAt).toLocaleString('es-ES')}`
                  : 'Sin envío confirmado'
              }
            />
            <Detail label="Saldo pendiente" value={formatEuros(invoiceOutstandingCents(invoice))} />
            <Detail
              label="Vence"
              value={`${invoice.dueDate}${overdue ? ' · vencida' : ''}`}
              danger={overdue}
            />
            <div>
              <dt className="text-muted-foreground text-xs">
                {invoice.contractPeriodId
                  ? 'Contrato de origen'
                  : invoice.workExtraId
                    ? 'Trabajo de origen'
                    : 'Presupuesto'}
              </dt>
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
                  ((invoice.contractPeriodId
                    ? invoice.snapshot?.contractTitle
                    : invoice.snapshot?.workTitle) ?? '—')
                )}
              </dd>
            </div>
          </dl>
          <PaymentForm key={invoice.paidCents} invoice={invoice} />
          <InvoicePaymentHistory tenantId={invoice.tenantId} invoiceId={invoice.id} />
        </aside>
      </div>
    </div>
  )
}

/** Registers a payment; the amount starts as everything still owed, so one click closes the invoice. */
function PaymentForm({ invoice }: { invoice: Invoice }) {
  const queryClient = useQueryClient()
  const owed = invoiceOutstandingCents(invoice)
  const [amount, setAmount] = useState((owed / 100).toFixed(2))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState<PaymentMethod>('transfer')
  const [busy, setBusy] = useState(false)
  if (invoice.status === 'paid') return null
  const cents = Math.round(Number(amount.replace(',', '.')) * 100)
  const valid = Number.isSafeInteger(cents) && cents > 0 && cents <= owed

  return (
    <div className="space-y-2 border-t pt-4 text-sm">
      <dl>
        <Detail label="Cobrado hasta ahora" value={formatEuros(invoice.paidCents)} />
        <Detail label="Pendiente" value={formatEuros(owed)} />
      </dl>
      <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
        <input
          aria-label="Importe cobrado (€)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border-input bg-background min-w-0 rounded-md border px-2 py-1.5 tabular-nums"
        />
        <input
          type="date"
          aria-label="Fecha del cobro"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border-input bg-background min-w-0 rounded-md border px-2 py-1.5"
        />
      </div>
      <SelectField
        label="Método de cobro"
        value={method}
        options={[
          { value: 'transfer', label: 'Transferencia' },
          { value: 'cash', label: 'Efectivo' },
          { value: 'card', label: 'Tarjeta' },
          { value: 'other', label: 'Otro' },
        ]}
        onChange={(value) => setMethod(value as PaymentMethod)}
      />
      <Button
        isDisabled={!valid || busy}
        onPress={() => {
          setBusy(true)
          void registerInvoicePayment(invoice.id, cents, method, date).then((result) => {
            setBusy(false)
            if (!result.ok) toast.error('No se registró el cobro', { description: result.error })
            else
              void queryClient.invalidateQueries({
                queryKey: ['invoice-payment-history', invoice.tenantId, invoice.id],
              })
          })
        }}
      >
        {busy
          ? 'Registrando…'
          : cents >= owed
            ? 'Registrar cobro completo'
            : 'Registrar cobro parcial'}
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
