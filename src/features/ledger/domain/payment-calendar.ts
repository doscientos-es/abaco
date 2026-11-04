export type ScheduledPayment = {
  id: string
  tenant_id: string
  concept: string
  supplier: string
  category: string
  amount_cents: number
  vat_rate: number
  due_date: string
  status: 'pending' | 'paid' | 'cancelled'
  paid_on: string | null
  ledger_entry_id: string | null
}

export type CalendarInvoice = {
  id: string
  number: string
  concept: string
  due_date: string
  total_cents: number
  paid_cents: number
  document_snapshot: { client?: { name?: string } } | null
}

export type CalendarItem = {
  id: string
  kind: 'income' | 'expense'
  date: string
  concept: string
  party: string
  amount: number
  paid: boolean
  payment?: ScheduledPayment
}

export function calendarItems(
  invoices: CalendarInvoice[],
  payments: ScheduledPayment[],
): CalendarItem[] {
  const income: CalendarItem[] = invoices.flatMap((invoice) => {
    const amount = Math.max(0, Number(invoice.total_cents) - Number(invoice.paid_cents))
    return amount > 0
      ? [
          {
            id: invoice.id,
            kind: 'income',
            date: invoice.due_date,
            concept: `${invoice.number} · ${invoice.concept}`,
            party: invoice.document_snapshot?.client?.name ?? '',
            amount,
            paid: false,
          },
        ]
      : []
  })
  const expense: CalendarItem[] = payments
    .filter((payment) => payment.status !== 'cancelled')
    .map((payment) => ({
      id: payment.id,
      kind: 'expense',
      date: payment.due_date,
      concept: payment.concept,
      party: payment.supplier,
      amount: Number(payment.amount_cents),
      paid: payment.status === 'paid',
      payment,
    }))
  return [...income, ...expense].sort(
    (a, b) => a.date.localeCompare(b.date) || a.concept.localeCompare(b.concept),
  )
}

export function calendarSummary(items: CalendarItem[], month: string, today: string) {
  const monthly = items.filter((item) => item.date.startsWith(month) && !item.paid)
  const overdue = items.filter((item) => item.date < today && !item.paid)
  return {
    income: monthly
      .filter((item) => item.kind === 'income')
      .reduce((sum, item) => sum + item.amount, 0),
    expense: monthly
      .filter((item) => item.kind === 'expense')
      .reduce((sum, item) => sum + item.amount, 0),
    overdue,
  }
}

/** Local calendar date, not UTC: a late evening must not become tomorrow. */
export function localToday(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
