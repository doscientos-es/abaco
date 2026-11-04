import { Button, ConfirmDialog, Input, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { formLimits } from '@/shared/domain/form-limits'
import { centsToInput, formatEuros, parseEuros } from '@/shared/domain/money'
import { newId, refreshStore, useSaveStatus } from '@/shared/store/store'
import { TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  cancelScheduledPayment,
  loadPaymentCalendar,
  saveScheduledPayment,
  settleScheduledPayment,
} from '../application/payment-calendar-actions'
import {
  calendarItems,
  calendarSummary,
  localToday,
  type CalendarItem,
  type ScheduledPayment,
} from '../domain/payment-calendar'

type PaymentForm = {
  id: string
  concept: string
  supplier: string
  category: string
  amount: string
  vatRate: string
  dueDate: string
}

export function PaymentCalendar({
  tenantId,
  defaultVatRate,
}: {
  tenantId: string
  defaultVatRate: number
}) {
  const [month, setMonth] = useState(() => localToday().slice(0, 7))
  const [form, setForm] = useState<PaymentForm | null>(null)
  const [paying, setPaying] = useState<ScheduledPayment | null>(null)
  const [paidOn, setPaidOn] = useState(localToday)
  const [cancelling, setCancelling] = useState<ScheduledPayment | null>(null)
  const [busy, setBusy] = useState(false)
  const saveStatus = useSaveStatus()
  const queryClient = useQueryClient()
  const queryKey = ['payment-calendar', tenantId]
  const query = useQuery({ queryKey, queryFn: () => loadPaymentCalendar(tenantId) })
  const today = localToday()
  const items = calendarItems(query.data?.invoices ?? [], query.data?.payments ?? [])
  const summary = calendarSummary(items, month, today)
  const monthly = items.filter((item) => item.date.startsWith(month))
  const earlierOverdue = summary.overdue.filter((item) => !item.date.startsWith(month))
  const [year, monthNumber] = month.split('-').map(Number)
  const days = new Date(Date.UTC(year ?? 0, monthNumber ?? 1, 0)).getUTCDate()
  const offset = (new Date(Date.UTC(year ?? 0, (monthNumber ?? 1) - 1, 1)).getUTCDay() + 6) % 7
  const amount = parseEuros(form?.amount ?? '')
  const vatRate = Number((form?.vatRate ?? '').replace(',', '.'))
  const valid =
    !!form &&
    !!form.concept.trim() &&
    form.concept.trim().length <= formLimits.ledgerConcept &&
    form.supplier.trim().length <= 200 &&
    form.category.trim().length <= formLimits.ledgerCategory &&
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    amount <= formLimits.monetaryAmount * 100 &&
    form.vatRate.trim() !== '' &&
    Number.isFinite(vatRate) &&
    vatRate >= 0 &&
    vatRate <= 100 &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)

  function edit(payment?: ScheduledPayment) {
    setForm(
      payment
        ? {
            id: payment.id,
            concept: payment.concept,
            supplier: payment.supplier,
            category: payment.category,
            amount: centsToInput(payment.amount_cents),
            vatRate: String(payment.vat_rate),
            dueDate: payment.due_date,
          }
        : {
            id: newId(),
            concept: '',
            supplier: '',
            category: '',
            amount: '',
            vatRate: String(defaultVatRate),
            dueDate: today,
          },
    )
  }

  async function run(action: () => Promise<void>, success: string, close: () => void) {
    if (busy) return
    setBusy(true)
    try {
      await action()
      close()
      await Promise.all([queryClient.invalidateQueries({ queryKey }), refreshStore()])
      toast.success(success)
    } catch (error) {
      toast.error('No se pudo guardar', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  function save() {
    if (!form || !valid) return
    void run(
      () =>
        saveScheduledPayment({
          id: form.id,
          tenant_id: tenantId,
          concept: form.concept,
          supplier: form.supplier,
          category: form.category,
          amount_cents: amount,
          vat_rate: vatRate,
          due_date: form.dueDate,
          status: 'pending',
          paid_on: null,
          ledger_entry_id: null,
        }),
      'Pago previsto guardado',
      () => setForm(null),
    )
  }

  function renderItem(item: CalendarItem) {
    return (
      <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-2 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {item.kind === 'income' ? (
              <Link className="underline" to="/facturas/$invoiceId" params={{ invoiceId: item.id }}>
                {item.concept}
              </Link>
            ) : (
              item.concept
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            {item.date} · {item.kind === 'income' ? 'Cobro' : 'Pago'}
            {item.party ? ` · ${item.party}` : ''} ·{' '}
            {item.paid
              ? `Pagado el ${item.payment?.paid_on}`
              : item.date < today
                ? 'Vencido'
                : 'Pendiente'}
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {item.kind === 'income' ? '+' : '−'}
          {formatEuros(item.amount)}
        </span>
        {item.payment && !item.paid ? (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => edit(item.payment)}>
              Editar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={busy}
              onPress={() => setCancelling(item.payment ?? null)}
            >
              Anular
            </Button>
            <Button
              size="sm"
              variant="outline"
              isDisabled={busy || saveStatus.state !== 'saved'}
              onPress={() => {
                setPaidOn(localToday())
                setPaying(item.payment ?? null)
              }}
            >
              Registrar pago
            </Button>
          </div>
        ) : null}
      </li>
    )
  }

  return (
    <section className="border-border bg-card space-y-4 rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Calendario de cobros y pagos</h2>
          <p className="text-muted-foreground text-sm">
            Vencimientos previstos; no son movimientos bancarios confirmados.
          </p>
        </div>
        <Input
          type="month"
          aria-label="Mes del calendario"
          className="w-44"
          value={month}
          onChange={(event) => {
            if (event.target.value) setMonth(event.target.value)
          }}
        />
        <Button onPress={() => edit()}>Prever pago</Button>
      </div>
      {query.isPending ? (
        <p className="text-sm">Cargando calendario…</p>
      ) : query.isError ? (
        <div className="text-destructive text-sm">
          No se pudo cargar el calendario.{' '}
          <Button variant="ghost" size="sm" onPress={() => void query.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <p>
              Cobros pendientes del mes: <strong>{formatEuros(summary.income)}</strong>
            </p>
            <p>
              Pagos pendientes del mes: <strong>{formatEuros(summary.expense)}</strong>
            </p>
            <p>
              Vencidos en total: <strong>{summary.overdue.length}</strong>
            </p>
          </div>
          <div
            className="grid grid-cols-7 gap-1 text-center text-xs"
            aria-label={`Calendario de ${month}`}
          >
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day, index) => (
              <span key={index} className="text-muted-foreground font-medium">
                {day}
              </span>
            ))}
            {Array.from({ length: offset }, (_, index) => (
              <span key={`empty-${index}`} />
            ))}
            {Array.from({ length: days }, (_, index) => {
              const date = `${month}-${String(index + 1).padStart(2, '0')}`
              const due = monthly.filter((item) => item.date === date && !item.paid)
              return (
                <div
                  key={date}
                  className="border-border min-h-14 rounded border p-1"
                  aria-label={`${date}: ${due.length} vencimientos pendientes`}
                >
                  <span className="block font-medium">{index + 1}</span>
                  {due.length ? (
                    <span className="text-muted-foreground">{due.length} pend.</span>
                  ) : null}
                </div>
              )
            })}
          </div>
          {earlierOverdue.length ? (
            <div>
              <h3 className="font-semibold">Otros vencidos</h3>
              <ul className="divide-border divide-y">{earlierOverdue.map(renderItem)}</ul>
            </div>
          ) : null}
          <div>
            <h3 className="font-semibold">Vencimientos del mes</h3>
            {monthly.length ? (
              <ul className="divide-border divide-y">{monthly.map(renderItem)}</ul>
            ) : (
              <p className="text-muted-foreground py-3 text-sm">No hay vencimientos este mes.</p>
            )}
          </div>
        </>
      )}
      <FormDialog
        open={!!form}
        onOpenChange={(open) => {
          if (!open) setForm(null)
        }}
        title="Pago previsto"
        description="El gasto se registrará solo cuando confirmes el pago."
        submitLabel="Guardar previsión"
        submitDisabled={!valid}
        isSubmitting={busy}
        onSubmit={save}
      >
        {form ? (
          <>
            <TextField
              label="Concepto"
              placeholder="Materiales"
              value={form.concept}
              maxLength={formLimits.ledgerConcept}
              onChange={(concept) => setForm({ ...form, concept })}
            />
            <TextField
              label="Proveedor"
              placeholder="Nombre del proveedor"
              value={form.supplier}
              maxLength={200}
              onChange={(supplier) => setForm({ ...form, supplier })}
            />
            <TextField
              label="Vencimiento"
              type="date"
              placeholder="dd/mm/aaaa"
              value={form.dueDate}
              onChange={(dueDate) => setForm({ ...form, dueDate })}
            />
            <TextField
              label="Importe con IVA (€)"
              placeholder="0,00"
              value={form.amount}
              onChange={(value) => setForm({ ...form, amount: value })}
            />
            <TextField
              label="Categoría"
              placeholder="Materiales"
              value={form.category}
              maxLength={formLimits.ledgerCategory}
              onChange={(category) => setForm({ ...form, category })}
            />
            <TextField
              label="IVA %"
              type="number"
              placeholder="21"
              min={0}
              max={100}
              step="0.01"
              value={form.vatRate}
              onChange={(value) => setForm({ ...form, vatRate: value })}
            />
          </>
        ) : null}
      </FormDialog>
      <FormDialog
        open={!!paying}
        onOpenChange={(open) => {
          if (!open) setPaying(null)
        }}
        title="Registrar pago"
        description={
          paying
            ? `Se añadirá un gasto de ${formatEuros(paying.amount_cents)} al libro. No lo registres si ya existe como apunte.`
            : ''
        }
        submitLabel="Registrar pago"
        submitDisabled={!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || saveStatus.state !== 'saved'}
        isSubmitting={busy}
        onSubmit={() => {
          if (paying)
            void run(
              () => settleScheduledPayment(tenantId, paying.id, paidOn),
              'Pago registrado',
              () => setPaying(null),
            )
        }}
      >
        <TextField
          label="Fecha real de pago"
          type="date"
          placeholder="dd/mm/aaaa"
          value={paidOn}
          onChange={setPaidOn}
        />
      </FormDialog>
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(open) => {
          if (!open && !busy) setCancelling(null)
        }}
        title="¿Anular previsión?"
        description={
          cancelling ? `«${cancelling.concept}» dejará de aparecer en el calendario.` : null
        }
        confirmLabel="Anular previsión"
        destructive
        onConfirm={() => {
          if (cancelling)
            void run(
              () => cancelScheduledPayment(tenantId, cancelling.id),
              'Previsión anulada',
              () => setCancelling(null),
            )
        }}
      />
    </section>
  )
}
