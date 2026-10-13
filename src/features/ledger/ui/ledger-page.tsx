import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@doscientos/ui'
import { useState } from 'react'

import { buildLedgerCsv, downloadTextFile, ledgerVatSummary } from '@/shared/domain/csv'
import { ledgerNetCents } from '@/shared/domain/estimate'
import { formatEuros, parseEuros } from '@/shared/domain/money'
import { categoryTotals, monthlySeries } from '@/shared/domain/stats'
import type { LedgerEntry, LedgerKind } from '@/shared/domain/types'
import { newId, updateTenantData, useTenantData } from '@/shared/store/store'
import { ChartCard, Donut, MonthlyBars } from '@/shared/ui/charts'
import { StatCard } from '@/shared/ui/stat-card'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'
import { TablePagination, usePagination } from '@/shared/ui/use-pagination'

const today = () => new Date().toISOString().slice(0, 10)

export function LedgerPage() {
  const { ledger, tenant } = useTenantData()
  const [month, setMonth] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<LedgerEntry | null>(null)
  const [form, setForm] = useState({
    kind: 'expense' as LedgerKind,
    date: today(),
    concept: '',
    category: 'Materiales',
    amount: '',
    vatRate: String(tenant.defaultVatRate),
  })

  const visible = ledger
    .filter((entry) => !month || entry.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date))
  const pager = usePagination(visible, month)
  const income = visible.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amountCents, 0)
  const expense = visible.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amountCents, 0)
  const vat = ledgerVatSummary(visible)
  const months = monthlySeries(ledger)
  const expenseByCategory = categoryTotals(visible, 'expense')

  function add() {
    const amountCents = parseEuros(form.amount)
    if (!form.concept.trim() || amountCents <= 0) return
    const entry: LedgerEntry = {
      id: newId(),
      tenantId: tenant.id,
      kind: form.kind,
      date: form.date,
      concept: form.concept.trim(),
      category: form.category.trim(),
      amountCents,
      vatRate: Number(form.vatRate) || 0,
      estimateId: null,
      milestoneId: null,
    }
    updateTenantData((data) => ({ ...data, ledger: [entry, ...data.ledger] }))
    setForm({ ...form, concept: '', amount: '' })
    setDialogOpen(false)
  }

  return (
    <div className="space-y-8">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Contabilidad</PageHeaderTitle>
          <PageHeaderDescription>Ingresos, gastos e IVA listos para tu gestoría.</PageHeaderDescription>
        </PageHeaderHeading>
        <PageHeaderActions>
          <Input
            type="month"
            aria-label="Filtrar por mes"
            className="w-40"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
          <Button onPress={() => setDialogOpen(true)}>Nuevo apunte</Button>
          <Button
            variant="outline"
            onPress={() =>
              downloadTextFile(`libro-${tenant.name.toLowerCase().replace(/\W+/g, '-')}-${month || 'todo'}.csv`, buildLedgerCsv(visible))
            }
            isDisabled={visible.length === 0}
          >
            Exportar CSV para la gestoría
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ingresos"
          value={formatEuros(income)}
          tone="success"
          icon={fieldIcons.euro}
          trend={months.map((m) => m.income)}
        />
        <StatCard
          label="Gastos"
          value={formatEuros(expense)}
          tone="danger"
          icon={fieldIcons.tag}
          trend={months.map((m) => m.expense)}
        />
        <StatCard
          label="Resultado"
          value={formatEuros(income - expense)}
          tone={income - expense < 0 ? 'danger' : 'default'}
          icon={fieldIcons.bank}
          trend={months.map((m) => m.income - m.expense)}
        />
        <StatCard
          label="IVA a ingresar"
          value={formatEuros(vat.collected - vat.paid)}
          hint={`Repercutido ${formatEuros(vat.collected)} · Soportado ${formatEuros(vat.paid)}`}
          icon={fieldIcons.percent}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="Ingresos y gastos por mes"
          description="Últimos 6 meses. Pasa el ratón por un mes para ver el detalle."
        >
          <MonthlyBars data={months} />
        </ChartCard>
        <ChartCard
          className="lg:col-span-2"
          title="En qué gastas"
          description={month ? 'Gastos del mes elegido.' : 'Gastos por categoría.'}
        >
          <Donut data={expenseByCategory} centerLabel="Gastos" empty="Aún no hay gastos" />
        </ChartCard>
      </div>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nuevo apunte"
        description="Registra un ingreso o un gasto en el libro."
        submitLabel="Añadir apunte"
        submitDisabled={!form.concept.trim() || parseEuros(form.amount) <= 0}
        onSubmit={add}
      >
        <SelectField
          label="Tipo"
          value={form.kind}
          options={[
            { value: 'expense', label: 'Gasto' },
            { value: 'income', label: 'Ingreso' },
          ]}
          onChange={(kind) => setForm({ ...form, kind: kind as LedgerKind })}
        />
        <TextField
          label="Fecha"
          type="date"
          placeholder="dd/mm/aaaa"
          value={form.date}
          onChange={(date) => setForm({ ...form, date })}
        />
        <TextField
          label="Importe con IVA (€)"
          placeholder="0,00"
          icon={fieldIcons.euro}
          value={form.amount}
          onChange={(amount) => setForm({ ...form, amount })}
        />
        <TextField
          label="Concepto"
          className="sm:col-span-2"
          placeholder="Ej. Compra de material en Leroy Merlin"
          value={form.concept}
          onChange={(concept) => setForm({ ...form, concept })}
        />
        <TextField
          label="Categoría"
          placeholder="Ej. Materiales"
          icon={fieldIcons.tag}
          value={form.category}
          onChange={(category) => setForm({ ...form, category })}
        />
        <TextField
          label="IVA %"
          placeholder="21"
          icon={fieldIcons.percent}
          helper="El importe ya incluye este IVA."
          value={form.vatRate}
          onChange={(vatRate) => setForm({ ...form, vatRate })}
        />
      </FormDialog>

      <ul className="space-y-3 md:hidden">
        {pager.pageItems.map((entry) => (
          <li
            key={entry.id}
            className="border-border bg-card space-y-3 rounded-lg border p-4 shadow-(--ui-shadow-hairline)"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{entry.concept}</p>
                <p className="text-muted-foreground text-xs">
                  {entry.date} · {entry.category}
                </p>
              </div>
              <p className="shrink-0 text-right font-semibold tabular-nums">
                {entry.kind === 'income' ? '+' : '−'}
                {formatEuros(entry.amountCents)}
                <span className="text-muted-foreground block text-xs font-normal">
                  Base {formatEuros(ledgerNetCents(entry))}
                </span>
              </p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Badge variant={entry.kind === 'income' ? 'success' : 'danger'}>
                {entry.kind === 'income' ? 'Ingreso' : 'Gasto'}
              </Badge>
              <Button className="text-destructive" variant="ghost" onPress={() => setToDelete(entry)}>
                Eliminar
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Table containerClassName="hidden md:block">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Concepto</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Base</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pager.pageItems.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="tabular-nums">{entry.date}</TableCell>
              <TableCell>
                {entry.concept}
                <div className="text-muted-foreground text-xs">{entry.category}</div>
              </TableCell>
              <TableCell>
                <Badge variant={entry.kind === 'income' ? 'success' : 'danger'}>
                  {entry.kind === 'income' ? 'Ingreso' : 'Gasto'}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatEuros(ledgerNetCents(entry))}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatEuros(entry.amountCents)}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="destructive" onPress={() => setToDelete(entry)}>
                  Eliminar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination controller={pager} noun="apuntes" />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="¿Eliminar apunte?"
        description={toDelete ? `«${toDelete.concept}» se borrará del libro.` : null}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          if (!toDelete) return
          const id = toDelete.id
          updateTenantData((d) => ({ ...d, ledger: d.ledger.filter((l) => l.id !== id) }))
          setToDelete(null)
        }}
      />
    </div>
  )
}
