import {
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { DotsThree, DownloadSimple, Plus, UploadSimple } from '@phosphor-icons/react'
import { useState } from 'react'

import {
  buildLedgerCsv,
  buildQuarterlyVatCsv,
  downloadTextFile,
  ledgerVatSummary,
  quarterlyVat,
} from '@/shared/domain/csv'
import { ledgerNetCents } from '@/shared/domain/estimate'
import { formLimits } from '@/shared/domain/form-limits'
import { fuzzySearch } from '@/shared/domain/fuzzy-search'
import { formatEuros, parseEuros } from '@/shared/domain/money'
import { categoryTotals, monthlySeries } from '@/shared/domain/stats'
import type { LedgerEntry, LedgerKind } from '@/shared/domain/types'
import { newId, updateTenantData, useTenantData } from '@/shared/store/store'
import { ChartCard, Donut, MonthlyBars } from '@/shared/ui/charts'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'
import { ImportDialog } from '@/shared/ui/import-dialog'
import { StatCard } from '@/shared/ui/stat-card'
import { TablePagination, usePagination } from '@/shared/ui/use-pagination'

/** `2026-03-15` -> `2026-T1`, same key as quarterlyVat. */
const quarterKey = (date: string) =>
  `${date.slice(0, 4)}-T${Math.ceil(Number(date.slice(5, 7)) / 3)}`

import { ledgerImportSchema, ledgerKeys } from '../application/ledger-import'

const today = () => new Date().toISOString().slice(0, 10)

export function LedgerPage() {
  const { ledger, tenant } = useTenantData()
  const [month, setMonth] = useState('')
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | LedgerKind>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [toDelete, setToDelete] = useState<LedgerEntry | null>(null)
  const [form, setForm] = useState({
    kind: 'expense' as LedgerKind,
    date: today(),
    concept: '',
    category: 'Materiales',
    amount: '',
    vatRate: String(tenant.defaultVatRate),
  })

  const monthEntries = ledger
    .filter((entry) => !month || entry.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date))
  const visible = monthEntries.filter(
    (entry) =>
      (kindFilter === 'all' || entry.kind === kindFilter) &&
      fuzzySearch(query, entry.concept, entry.category, entry.date, entry.kind),
  )
  const pager = usePagination(
    visible,
    `${month}|${kindFilter}|${query.trim().toLocaleLowerCase('es')}`,
  )
  const income = monthEntries
    .filter((e) => e.kind === 'income')
    .reduce((s, e) => s + e.amountCents, 0)
  const expense = monthEntries
    .filter((e) => e.kind === 'expense')
    .reduce((s, e) => s + e.amountCents, 0)
  const vat = ledgerVatSummary(monthEntries)
  const quarters = quarterlyVat(ledger)
  const months = monthlySeries(ledger)
  const expenseByCategory = categoryTotals(monthEntries, 'expense')

  function add() {
    const amountCents = parseEuros(form.amount)
    const vatRate = Number(form.vatRate.replace(',', '.'))
    if (
      !form.concept.trim() ||
      form.concept.trim().length > formLimits.ledgerConcept ||
      form.category.trim().length > formLimits.ledgerCategory ||
      amountCents <= 0 ||
      amountCents > formLimits.monetaryAmount * 100 ||
      !Number.isFinite(vatRate) ||
      vatRate < 0 ||
      vatRate > 100 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(form.date)
    )
      return
    const entry: LedgerEntry = {
      id: newId(),
      tenantId: tenant.id,
      kind: form.kind,
      date: form.date,
      concept: form.concept.trim(),
      category: form.category.trim(),
      amountCents,
      vatRate: Math.round(vatRate * 100) / 100,
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
          <PageHeaderDescription>
            Ingresos, gastos e IVA listos para tu gestoría.
          </PageHeaderDescription>
        </PageHeaderHeading>
        <PageHeaderActions className="shrink-0">
          <Button onPress={() => setDialogOpen(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Nuevo apunte
          </Button>
          <DropdownMenuTrigger>
            <Button variant="outline" aria-label="Más opciones de contabilidad">
              <DotsThree aria-hidden="true" weight="bold" className="size-5" />
              Más opciones
            </Button>
            <DropdownMenuContent placement="bottom end" className="w-64">
              <DropdownMenuItem onAction={() => setImportOpen(true)}>
                <UploadSimple aria-hidden="true" className="size-4 shrink-0" />
                <span className="whitespace-nowrap">Importar de Excel</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onAction={() =>
                  downloadTextFile(
                    `libro-${tenant.name.toLowerCase().replace(/\W+/g, '-')}-${month || 'todo'}.csv`,
                    buildLedgerCsv(monthEntries),
                  )
                }
                isDisabled={monthEntries.length === 0}
              >
                <DownloadSimple aria-hidden="true" className="size-4 shrink-0" />
                <span className="whitespace-nowrap">Exportar CSV para la gestoría</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuTrigger>
        </PageHeaderActions>
      </PageHeader>

      <div className="border-border/70 bg-card flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Periodo</p>
          <p className="text-muted-foreground text-xs">Filtra indicadores y apuntes por mes</p>
        </div>
        <Input
          type="month"
          aria-label="Filtrar por mes"
          className="w-44"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
        {month ? (
          <Button variant="ghost" size="sm" onPress={() => setMonth('')}>
            Ver todos
          </Button>
        ) : null}
      </div>

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
          <Donut
            data={expenseByCategory}
            centerLabel="Gastos"
            empty="Aún no hay gastos"
            emptyDescription="Al registrar gastos verás cuánto se va en cada categoría."
            emptyIcon={fieldIcons.euro}
          />
        </ChartCard>
      </div>

      {quarters.length > 0 ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">IVA por trimestre (modelo 303)</h2>
              <p className="text-muted-foreground text-sm">
                Con todos los apuntes, sin filtrar por mes. Un resultado negativo es IVA a
                compensar.
              </p>
            </div>
            <Button
              variant="outline"
              onPress={() =>
                downloadTextFile(
                  `iva-trimestral-${tenant.name.toLowerCase().replace(/\W+/g, '-')}.csv`,
                  buildQuarterlyVatCsv(quarters),
                )
              }
            >
              Exportar IVA trimestral
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trimestre</TableHead>
                <TableHead className="text-right">Repercutido</TableHead>
                <TableHead className="text-right">Soportado</TableHead>
                <TableHead className="text-right">A ingresar</TableHead>
                <TableHead className="text-right">Para la gestoría</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quarters.map((q) => (
                <TableRow key={q.key}>
                  <TableCell>{q.key}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatEuros(q.collected)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatEuros(q.paid)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatEuros(q.toPay)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      onPress={() =>
                        downloadTextFile(
                          `libro-${tenant.name.toLowerCase().replace(/\W+/g, '-')}-${q.key}.csv`,
                          buildLedgerCsv(ledger.filter((e) => quarterKey(e.date) === q.key)),
                        )
                      }
                    >
                      Libro del trimestre
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          aria-label="Buscar apuntes"
          maxLength={formLimits.searchQuery}
          placeholder="Buscar concepto, categoría o fecha…"
          className="sm:max-w-sm sm:flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <SelectField
          label="Filtrar por tipo"
          hideLabel
          className="sm:w-44"
          value={kindFilter}
          options={[
            { value: 'all', label: 'Todos los tipos' },
            { value: 'income', label: 'Ingresos' },
            { value: 'expense', label: 'Gastos' },
          ]}
          onChange={(value) => setKindFilter(value as 'all' | LedgerKind)}
        />
        {query || kindFilter !== 'all' ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setQuery('')
              setKindFilter('all')
            }}
          >
            Limpiar filtros
          </Button>
        ) : null}
        <p className="text-muted-foreground text-sm tabular-nums sm:ml-auto">
          {visible.length} {visible.length === 1 ? 'apunte' : 'apuntes'}
        </p>
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        schema={ledgerImportSchema}
        existingKeys={ledgerKeys(ledger)}
        onImport={(values) =>
          updateTenantData((data) => ({
            ...data,
            ledger: [
              ...values.map((v) => ({ id: newId(), tenantId: data.tenant.id, ...v })),
              ...data.ledger,
            ],
          }))
        }
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nuevo apunte"
        description="Registra un ingreso o un gasto en el libro."
        submitLabel="Añadir apunte"
        submitDisabled={
          !form.concept.trim() ||
          form.concept.trim().length > formLimits.ledgerConcept ||
          form.category.trim().length > formLimits.ledgerCategory ||
          parseEuros(form.amount) <= 0 ||
          parseEuros(form.amount) > formLimits.monetaryAmount * 100 ||
          !Number.isFinite(Number(form.vatRate.replace(',', '.'))) ||
          Number(form.vatRate.replace(',', '.')) < 0 ||
          Number(form.vatRate.replace(',', '.')) > 100
        }
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
          maxLength={18}
          placeholder="0,00"
          icon={fieldIcons.euro}
          value={form.amount}
          onChange={(amount) => setForm({ ...form, amount })}
        />
        <TextField
          label="Concepto"
          minLength={2}
          maxLength={formLimits.ledgerConcept}
          className="sm:col-span-2"
          placeholder="Ej. Compra de material en Leroy Merlin"
          value={form.concept}
          onChange={(concept) => setForm({ ...form, concept })}
        />
        <TextField
          label="Categoría"
          maxLength={formLimits.ledgerCategory}
          placeholder="Ej. Materiales"
          icon={fieldIcons.tag}
          value={form.category}
          onChange={(category) => setForm({ ...form, category })}
        />
        <TextField
          label="IVA %"
          type="number"
          min={0}
          max={100}
          step="0.01"
          placeholder="21"
          icon={fieldIcons.percent}
          helper="Entre 0 y 100. El importe ya incluye este IVA."
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
              <Button
                className="text-destructive"
                variant="ghost"
                onPress={() => setToDelete(entry)}
              >
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
              <TableCell className="text-right tabular-nums">
                {formatEuros(ledgerNetCents(entry))}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatEuros(entry.amountCents)}
              </TableCell>
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
