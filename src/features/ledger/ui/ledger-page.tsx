import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
} from '@doscientos/ui'
import { Paperclip, Plus } from '@phosphor-icons/react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'

import {
  applyReceiptSuggestion,
  ReceiptAiReview,
  resetReceiptAutofill,
  useAiAccess,
  type ReceiptFields,
} from '@/features/ai'
import { useSession } from '@/features/auth'
import { quarterlyVat } from '@/shared/domain/csv'
import { ledgerNetCents } from '@/shared/domain/estimate'
import { formLimits } from '@/shared/domain/form-limits'
import { fuzzySearch } from '@/shared/domain/fuzzy-search'
import { parseLedgerVatBreakdown } from '@/shared/domain/ledger-vat'
import { formatEuros, parseEuros } from '@/shared/domain/money'
import type { LedgerEntry, LedgerKind, TenantData } from '@/shared/domain/types'
import {
  currentTenantData,
  newId,
  synchronizeStoreSaves,
  updateTenantData,
  useSaveStatus,
  useTenantData,
} from '@/shared/store/store'
import { DashboardPageHeading } from '@/shared/ui/dashboard-layout-editor'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'
import { ImportDialog } from '@/shared/ui/import-dialog'
import { EmptyPanel } from '@/shared/ui/page-states'
import { TableColumnsCells, TableColumnsHeader, useTableColumns } from '@/shared/ui/table-columns'
import { TablePagination, usePagination } from '@/shared/ui/use-pagination'
import { WorkspacePageTabs } from '@/shared/ui/workspace-page-chrome'

import { hasProtectedLedgerHistory } from '../application/expense-allocation-actions'
import {
  listLedgerAttachments,
  uploadLedgerAttachment,
  type PendingLedgerAttachment,
} from '../application/ledger-attachment-actions'
import { ledgerImportSchema, ledgerKeys } from '../application/ledger-import'
import { ledgerSummaryStorageKey } from '../application/ledger-summary-preferences'
import { ledgerEntriesInQuarter, ledgerQuarterOptions } from '../domain/ledger-quarter'
import { ExpenseAllocationDialog } from './expense-allocation-dialog'
import { LedgerAttachmentsDialog } from './ledger-attachments-dialog'
import { LedgerSummary, useLedgerSummaryEditor } from './ledger-summary'
import { ledgerTabs, type LedgerTab } from './ledger-tabs'
import { LedgerVatFields } from './ledger-vat-fields'
import { PaymentCalendar } from './payment-calendar'
import { useLedgerExports } from './use-ledger-exports'

const today = () => new Date().toISOString().slice(0, 10)
const receiptDefaults = (kind: LedgerKind, defaultVatRate: number): ReceiptFields => ({
  kind,
  date: today(),
  concept: '',
  category: kind === 'expense' ? 'Materiales' : 'Ingresos',
  amount: '',
  vatRate: String(defaultVatRate),
  counterpartyName: '',
  counterpartyTaxId: '',
  documentNumber: '',
  vatLines: [],
})
const ledgerTabLabels: Record<LedgerTab, string> = {
  resumen: 'Resumen',
  apuntes: 'Apuntes',
  iva: 'IVA trimestral',
  calendario: 'Cobros y pagos',
}

const ledgerColumns = [
  { id: 'date', label: 'Fecha' },
  { id: 'concept', label: 'Concepto', required: true },
  { id: 'kind', label: 'Tipo' },
  { id: 'net', label: 'Base', headClassName: 'text-right' },
  { id: 'total', label: 'Total', headClassName: 'text-right' },
] as const

function MonthFilter({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="border-border/70 bg-card flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Periodo</p>
        <p className="text-muted-foreground text-xs">Filtra el libro por mes.</p>
      </div>
      <Input
        type="month"
        aria-label="Filtrar por mes"
        className="w-44"
        value={month}
        onChange={(event) => onChange(event.target.value)}
      />
      {month ? (
        <Button variant="ghost" size="sm" onPress={() => onChange('')}>
          Ver todos
        </Button>
      ) : null}
    </div>
  )
}

function FiscalDetails({ entry }: { entry: LedgerEntry }) {
  if (
    !entry.counterpartyName &&
    !entry.counterpartyTaxId &&
    !entry.documentNumber &&
    !entry.vatBreakdown?.length
  )
    return null
  return (
    <details className="text-muted-foreground mt-1 text-xs">
      <summary className="cursor-pointer">Datos fiscales</summary>
      {entry.counterpartyName ? (
        <p>
          {entry.kind === 'expense' ? 'Proveedor' : 'Cliente'}: {entry.counterpartyName}
        </p>
      ) : null}
      {entry.counterpartyTaxId ? <p>NIF: {entry.counterpartyTaxId}</p> : null}
      {entry.documentNumber ? <p>Documento: {entry.documentNumber}</p> : null}
      {entry.vatBreakdown?.map((line, index) => (
        <p key={index}>
          IVA {line.rate} % · Base {formatEuros(line.baseCents)} · Cuota{' '}
          {formatEuros(line.vatCents)}
        </p>
      ))}
    </details>
  )
}

export function LedgerPage() {
  const { ledger, tenant } = useTenantData()
  const session = useSession()
  const isAdmin = session?.tenantId === tenant.id && session?.role === 'admin'
  const storageKey = ledgerSummaryStorageKey(tenant.id, session?.userId ?? 'anonymous')
  return (
    <LedgerContent
      key={`${storageKey}:${isAdmin}`}
      ledger={ledger}
      tenant={tenant}
      isAdmin={isAdmin}
      storageKey={storageKey}
    />
  )
}

function LedgerContent({
  ledger,
  tenant,
  isAdmin,
  storageKey,
}: Pick<TenantData, 'ledger' | 'tenant'> & { isAdmin: boolean; storageKey: string }) {
  const session = useSession()
  const aiAccess = useAiAccess(tenant.id, isAdmin ? session?.userId : undefined)
  const columns = useTableColumns('apuntes', ledgerColumns)
  const navigate = useNavigate()
  const search = useSearch({ from: '/contabilidad' })
  const requestedTab = search.tab
  const tab = requestedTab ?? 'resumen'
  const saveStatus = useSaveStatus()
  const [month, setMonth] = useState('')
  const [quarterKey, setQuarterKey] = useState('')
  const query = search.q ?? ''
  const setQuery = (q: string) =>
    void navigate({
      to: '/contabilidad',
      search: { ...(requestedTab ? { tab: requestedTab } : {}), ...(q ? { q } : {}) },
      replace: true,
    })
  const [kindFilter, setKindFilter] = useState<'all' | LedgerKind>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [toDelete, setToDelete] = useState<LedgerEntry | null>(null)
  const [toAllocate, setToAllocate] = useState<LedgerEntry | null>(null)
  const [receipt, setReceipt] = useState<File | null>(null)
  const [analyzingReceipt, setAnalyzingReceipt] = useState(false)
  const editedReceiptFields = useRef(new Set<keyof ReceiptFields>())
  const [adding, setAdding] = useState(false)
  const [attachments, setAttachments] = useState<{
    entry: LedgerEntry
    pending: PendingLedgerAttachment | null
  } | null>(null)
  const [form, setForm] = useState<ReceiptFields>(() =>
    receiptDefaults('expense', tenant.defaultVatRate),
  )

  const orderedEntries = useMemo(
    () => [...ledger].sort((a, b) => b.date.localeCompare(a.date)),
    [ledger],
  )
  const monthEntries = month
    ? orderedEntries.filter((entry) => entry.date.startsWith(month))
    : orderedEntries
  const visible = monthEntries.filter(
    (entry) =>
      (kindFilter === 'all' || entry.kind === kindFilter) &&
      fuzzySearch(
        query,
        entry.concept,
        entry.category,
        entry.date,
        entry.kind,
        entry.counterpartyName ?? '',
        entry.counterpartyTaxId ?? '',
        entry.documentNumber ?? '',
      ),
  )
  const pager = usePagination(
    visible,
    `${month}|${kindFilter}|${query.trim().toLocaleLowerCase('es')}`,
  )
  const quarters = useMemo(() => quarterlyVat(ledger), [ledger])
  const quarterOptions = useMemo(
    () => ledgerQuarterOptions(quarters.map(({ year }) => year)),
    [quarters],
  )
  const quarter = quarterOptions.find(({ value }) => value === quarterKey) ?? null
  const summaryEntries = useMemo(
    () => (quarter ? ledgerEntriesInQuarter(orderedEntries, quarter) : orderedEntries),
    [orderedEntries, quarter],
  )
  const summary = useLedgerSummaryEditor(storageKey, isAdmin)
  const { exportAction, downloadBook } = useLedgerExports({
    tenant,
    canExportDatasets: isAdmin,
    period: quarter?.value ?? '',
    entries: summaryEntries,
    quarters,
  })
  const vatExport = exportAction('vat')
  const breakdown = form.vatLines.length
    ? parseLedgerVatBreakdown(form.vatLines, parseEuros(form.amount))
    : null
  const validVat =
    form.vatLines.length > 0
      ? breakdown !== null
      : !!form.vatRate.trim() &&
        Number.isFinite(Number(form.vatRate.replace(',', '.'))) &&
        Number(form.vatRate.replace(',', '.')) >= 0 &&
        Number(form.vatRate.replace(',', '.')) <= 100

  function openAdd(kind: LedgerKind) {
    editedReceiptFields.current.clear()
    setReceipt(null)
    setForm(receiptDefaults(kind, tenant.defaultVatRate))
    setDialogOpen(true)
  }

  function resetAutofill() {
    const edited = new Set(editedReceiptFields.current)
    setForm((current) =>
      resetReceiptAutofill(current, receiptDefaults(current.kind, tenant.defaultVatRate), edited),
    )
  }

  async function add() {
    const amountCents = parseEuros(form.amount)
    const vatRate = Number(form.vatRate.replace(',', '.'))
    if (
      adding ||
      analyzingReceipt ||
      !form.concept.trim() ||
      form.concept.trim().length > formLimits.ledgerConcept ||
      form.category.trim().length > formLimits.ledgerCategory ||
      amountCents <= 0 ||
      amountCents > formLimits.monetaryAmount * 100 ||
      !validVat ||
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
      vatRate: breakdown?.[0]?.rate ?? Math.round(vatRate * 100) / 100,
      ...(breakdown ? { vatBreakdown: breakdown } : {}),
      ...(form.counterpartyName.trim() ? { counterpartyName: form.counterpartyName.trim() } : {}),
      ...(form.counterpartyTaxId.trim()
        ? { counterpartyTaxId: form.counterpartyTaxId.trim() }
        : {}),
      ...(form.documentNumber.trim() ? { documentNumber: form.documentNumber.trim() } : {}),
      estimateId: null,
      milestoneId: null,
    }
    updateTenantData((data) => ({ ...data, ledger: [entry, ...data.ledger] }))
    const pending = receipt && isAdmin ? { id: newId(), file: receipt } : null
    if (pending) {
      setAdding(true)
      try {
        await synchronizeStoreSaves()
        if (currentTenantData()?.tenant.id === entry.tenantId) {
          await uploadLedgerAttachment(entry, pending)
          toast.success('Apunte y justificante guardados')
        }
      } catch {
        if (currentTenantData()?.tenant.id === entry.tenantId) setAttachments({ entry, pending })
      } finally {
        setAdding(false)
      }
    }
    editedReceiptFields.current.clear()
    setForm(receiptDefaults(form.kind, tenant.defaultVatRate))
    setReceipt(null)
    setDialogOpen(false)
  }

  async function confirmDeletion(entry: LedgerEntry) {
    try {
      const hasHistory = await hasProtectedLedgerHistory(tenant.id, entry.id, entry.kind)
      if (hasHistory) {
        toast.error('Este asiento tiene historial financiero y no se puede eliminar')
        return
      }
      if (isAdmin && (await listLedgerAttachments(entry)).length > 0) {
        toast.error('Quita los justificantes antes de eliminar el apunte')
        setAttachments({ entry, pending: null })
        return
      }
    } catch (error) {
      toast.error('No se pudo comprobar el historial del asiento', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      return
    }
    setToDelete(entry)
  }

  function attachmentButton(entry: LedgerEntry) {
    if (!isAdmin) return null
    return (
      <Button size="sm" variant="outline" onPress={() => setAttachments({ entry, pending: null })}>
        <Paperclip aria-hidden="true" className="size-4" />
        Justificantes
      </Button>
    )
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeading
        title="Contabilidad"
        editor={tab === 'resumen' ? summary.editor : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onPress={() => openAdd('income')}>
              <Plus aria-hidden="true" className="size-4" /> Añadir ingreso
            </Button>
            <Button onPress={() => openAdd('expense')}>
              <Plus aria-hidden="true" className="size-4" /> Añadir gasto
            </Button>
          </div>
        }
      />

      <WorkspacePageTabs>
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) =>
            void navigate({ to: '/contabilidad', search: { ...search, tab: key as LedgerTab } })
          }
        >
          <TabsList aria-label="Secciones de contabilidad">
            {ledgerTabs.map((id) => (
              <TabsTrigger key={id} id={id}>
                {ledgerTabLabels[id]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </WorkspacePageTabs>

      {tab === 'calendario' ? (
        <PaymentCalendar
          key={tenant.id}
          tenantId={tenant.id}
          defaultVatRate={tenant.defaultVatRate}
        />
      ) : null}

      {tab === 'resumen' ? (
        <LedgerSummary
          layout={summary}
          entries={summaryEntries}
          quarter={quarter}
          exportAction={exportAction}
          onImport={() => setImportOpen(true)}
          periodFilter={
            <div className="border-border/70 bg-card flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-medium">Periodo del resumen</p>
                <p className="text-muted-foreground text-xs">
                  Limita el resumen y el CSV al trimestre elegido. Sin trimestre, cada gráfico puede
                  tener su propio periodo.
                </p>
              </div>
              <SelectField
                label="Trimestre del resumen"
                hideLabel
                searchable={false}
                value={quarter?.value ?? ''}
                options={[{ value: '', label: 'Todos los trimestres' }, ...quarterOptions]}
                onChange={setQuarterKey}
              />
            </div>
          }
        />
      ) : null}

      {tab === 'iva' ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">IVA por trimestre (modelo 303)</h2>
              <p className="text-muted-foreground text-sm">
                Cálculo con todos los apuntes, independiente del periodo seleccionado en el libro.
                Un resultado negativo es IVA a compensar.
              </p>
            </div>
            {quarters.length ? (
              <Button variant="outline" onPress={vatExport.run}>
                Exportar IVA trimestral
              </Button>
            ) : null}
          </div>
          {quarters.length ? (
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
                        onPress={() => downloadBook(ledgerEntriesInQuarter(ledger, q), q.key)}
                      >
                        Libro del trimestre
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="border-border bg-card rounded-xl border p-6 text-center">
              <p className="font-medium">Aún no hay datos de IVA trimestral</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Cuando registres ingresos o gastos con IVA aparecerán aquí los trimestres y el CSV
                para tu gestoría.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'apuntes' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Libro de apuntes</h2>
              <p className="text-muted-foreground text-sm">Consulta y filtra ingresos y gastos.</p>
            </div>
            <p className="text-muted-foreground text-sm tabular-nums">
              {visible.length} {visible.length === 1 ? 'apunte' : 'apuntes'}
            </p>
          </div>
          <MonthFilter month={month} onChange={setMonth} />
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
          </div>
        </section>
      ) : null}

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
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) {
            setReceipt(null)
            setAnalyzingReceipt(false)
            resetAutofill()
          }
        }}
        title={form.kind === 'expense' ? 'Añadir gasto' : 'Añadir ingreso'}
        description="Registra la operación y revisa los datos del justificante."
        submitLabel={
          adding ? 'Guardando…' : form.kind === 'expense' ? 'Añadir gasto' : 'Añadir ingreso'
        }
        isSubmitting={adding}
        isDirty={!!receipt}
        submitDisabled={
          analyzingReceipt ||
          !form.concept.trim() ||
          form.concept.trim().length > formLimits.ledgerConcept ||
          form.category.trim().length > formLimits.ledgerCategory ||
          parseEuros(form.amount) <= 0 ||
          parseEuros(form.amount) > formLimits.monetaryAmount * 100 ||
          !validVat
        }
        onSubmit={() => void add()}
      >
        <TextField
          label="Fecha"
          type="date"
          placeholder="dd/mm/aaaa"
          value={form.date}
          onChange={(date) => {
            editedReceiptFields.current.add('date')
            setForm((current) => ({ ...current, date }))
          }}
        />
        <TextField
          label="Importe con IVA (€)"
          maxLength={18}
          placeholder="0,00"
          icon={fieldIcons.euro}
          value={form.amount}
          onChange={(amount) => {
            editedReceiptFields.current.add('amount')
            setForm((current) => ({ ...current, amount }))
          }}
        />
        <TextField
          label="Concepto"
          minLength={2}
          maxLength={formLimits.ledgerConcept}
          className="sm:col-span-2"
          placeholder="Ej. Compra de material en Leroy Merlin"
          value={form.concept}
          onChange={(concept) => {
            editedReceiptFields.current.add('concept')
            setForm((current) => ({ ...current, concept }))
          }}
        />
        <TextField
          label="Categoría"
          maxLength={formLimits.ledgerCategory}
          placeholder="Ej. Materiales"
          icon={fieldIcons.tag}
          value={form.category}
          onChange={(category) => {
            editedReceiptFields.current.add('category')
            setForm((current) => ({ ...current, category }))
          }}
        />
        <TextField
          label={form.kind === 'expense' ? 'Proveedor' : 'Cliente'}
          placeholder="Nombre o razón social"
          maxLength={200}
          value={form.counterpartyName}
          onChange={(counterpartyName) => {
            editedReceiptFields.current.add('counterpartyName')
            setForm((current) => ({ ...current, counterpartyName }))
          }}
        />
        <TextField
          label={form.kind === 'expense' ? 'NIF del proveedor' : 'NIF del cliente'}
          placeholder="NIF"
          maxLength={40}
          value={form.counterpartyTaxId}
          onChange={(counterpartyTaxId) => {
            editedReceiptFields.current.add('counterpartyTaxId')
            setForm((current) => ({ ...current, counterpartyTaxId }))
          }}
        />
        <TextField
          label="Número de factura o justificante"
          placeholder="Número del documento"
          maxLength={100}
          value={form.documentNumber}
          onChange={(documentNumber) => {
            editedReceiptFields.current.add('documentNumber')
            setForm((current) => ({ ...current, documentNumber }))
          }}
        />
        {!form.vatLines.length ? (
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
            onChange={(vatRate) => {
              editedReceiptFields.current.add('vatRate')
              setForm((current) => ({ ...current, vatRate }))
            }}
          />
        ) : null}
        <p className="text-muted-foreground text-xs sm:col-span-2">
          Este formulario no desglosa retenciones ni otros cargos. Si el justificante los incluye,
          el cálculo del IVA puede ser incorrecto.
        </p>
        {form.vatLines.length ? (
          <>
            <LedgerVatFields
              lines={form.vatLines}
              onChange={(vatLines) => {
                editedReceiptFields.current.add('vatLines')
                setForm((current) => ({ ...current, vatLines }))
              }}
            />
            {!validVat ? (
              <p role="alert" className="text-destructive text-sm sm:col-span-2">
                Completa el desglose: la suma de bases y cuotas debe coincidir con el importe total.
              </p>
            ) : null}
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onPress={() => {
              editedReceiptFields.current.add('vatLines')
              setForm((current) => ({
                ...current,
                vatLines: [{ rate: current.vatRate, base: '', vat: '' }],
              }))
            }}
          >
            Desglosar varios tipos de IVA
          </Button>
        )}
        {isAdmin && dialogOpen ? (
          <div className="sm:col-span-2">
            <ReceiptAiReview
              tenantId={tenant.id}
              file={receipt}
              canAnalyze={aiAccess.data === true}
              checkingAccess={aiAccess.isPending && aiAccess.fetchStatus === 'fetching'}
              onBusyChange={setAnalyzingReceipt}
              onAnalysisStart={resetAutofill}
              onFileChange={(file) => {
                setReceipt(file)
                resetAutofill()
              }}
              onApply={(suggestion) => {
                const edited = new Set(editedReceiptFields.current)
                setForm((current) => applyReceiptSuggestion(current, suggestion, edited))
              }}
            />
          </div>
        ) : null}
      </FormDialog>

      {tab === 'apuntes' ? (
        visible.length === 0 ? (
          <EmptyPanel
            icon={ledger.length === 0 ? fieldIcons.euro : fieldIcons.search}
            title={ledger.length === 0 ? 'Aún no hay apuntes' : 'No hay apuntes para estos filtros'}
            description={
              ledger.length === 0
                ? 'Añade un ingreso o gasto para empezar tu libro.'
                : 'Prueba con otro periodo o limpia los filtros para ver todos los apuntes.'
            }
          >
            {ledger.length === 0 ? (
              <Button onPress={() => openAdd('expense')}>Añadir gasto</Button>
            ) : (
              <Button
                variant="outline"
                onPress={() => {
                  setMonth('')
                  setKindFilter('all')
                  setQuery('')
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </EmptyPanel>
        ) : (
          <>
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
                      <FiscalDetails entry={entry} />
                    </div>
                    <p className="shrink-0 text-right font-semibold tabular-nums">
                      {entry.kind === 'income' && entry.amountCents > 0 ? '+' : '−'}
                      {formatEuros(Math.abs(entry.amountCents))}
                      <span className="text-muted-foreground block text-xs font-normal">
                        Base {formatEuros(ledgerNetCents(entry))}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge
                      variant={
                        entry.kind === 'income' && entry.amountCents > 0 ? 'success' : 'danger'
                      }
                    >
                      {entry.kind === 'income'
                        ? entry.amountCents < 0
                          ? 'Reembolso'
                          : 'Ingreso'
                        : 'Gasto'}
                    </Badge>
                    {attachmentButton(entry)}
                    {entry.kind === 'expense' && isAdmin ? (
                      <Button
                        variant="outline"
                        size="sm"
                        isDisabled={saveStatus.state !== 'saved'}
                        onPress={() => setToAllocate(entry)}
                      >
                        Imputar
                      </Button>
                    ) : null}
                    <Button
                      className="text-destructive"
                      variant="ghost"
                      onPress={() => void confirmDeletion(entry)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <Table containerClassName="max-md:hidden">
              <TableHeader>
                <TableRow>
                  <TableColumnsHeader columns={columns} tableName="apuntes" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageItems.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableColumnsCells
                      columns={columns}
                      cells={{
                        date: <TableCell className="tabular-nums">{entry.date}</TableCell>,
                        concept: (
                          <TableCell>
                            {entry.concept}
                            <div className="text-muted-foreground text-xs">{entry.category}</div>
                            <FiscalDetails entry={entry} />
                          </TableCell>
                        ),
                        kind: (
                          <TableCell>
                            <Badge
                              variant={
                                entry.kind === 'income' && entry.amountCents > 0
                                  ? 'success'
                                  : 'danger'
                              }
                            >
                              {entry.kind === 'income'
                                ? entry.amountCents < 0
                                  ? 'Reembolso'
                                  : 'Ingreso'
                                : 'Gasto'}
                            </Badge>
                          </TableCell>
                        ),
                        net: (
                          <TableCell className="text-right tabular-nums">
                            {formatEuros(ledgerNetCents(entry))}
                          </TableCell>
                        ),
                        total: (
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatEuros(entry.amountCents)}
                          </TableCell>
                        ),
                      }}
                    />
                    <TableCell className="text-right">
                      {attachmentButton(entry)}{' '}
                      {entry.kind === 'expense' && isAdmin ? (
                        <Button
                          size="sm"
                          variant="outline"
                          isDisabled={saveStatus.state !== 'saved'}
                          onPress={() => setToAllocate(entry)}
                        >
                          Imputar
                        </Button>
                      ) : null}{' '}
                      <Button
                        size="sm"
                        variant="destructive"
                        onPress={() => void confirmDeletion(entry)}
                      >
                        Eliminar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination controller={pager} noun="apuntes" />
          </>
        )
      ) : null}

      <ExpenseAllocationDialog entry={toAllocate} onClose={() => setToAllocate(null)} />
      {isAdmin && attachments?.entry.tenantId === tenant.id ? (
        <LedgerAttachmentsDialog
          key={attachments.entry.id}
          entry={attachments.entry}
          initialFile={attachments.pending}
          onClose={() => setAttachments(null)}
        />
      ) : null}

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
