import {
  Badge,
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@doscientos/ui'
import { DotsThree } from '@phosphor-icons/react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { formatEuros } from '@/shared/domain/money'
import type { Invoice, InvoiceStatus } from '@/shared/domain/types'
import { sendDocument } from '@/shared/lib/send-document'
import { useTenantData } from '@/shared/store/store'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField } from '@/shared/ui/form'
import { EmptyPanel } from '@/shared/ui/page-states'
import { StatCard } from '@/shared/ui/stat-card'
import { TablePagination, usePagination } from '@/shared/ui/use-pagination'

import { deleteInvoice, markInvoicePaid, setInvoiceStatus } from '../application/invoice-actions'

const statusConfig: Record<InvoiceStatus, { label: string; variant: 'neutral' | 'info' | 'success' }> = {
  issued: { label: 'Emitida', variant: 'neutral' },
  sent: { label: 'Enviada', variant: 'info' },
  paid: { label: 'Cobrada', variant: 'success' },
}

export function InvoicesPage() {
  const { invoices, clients, estimates } = useTenantData()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'all' | InvoiceStatus>('all')
  const [clientId, setClientId] = useState('all')
  const initialQuery = useSearch({ from: '/facturas/' }).q
  const [query, setQuery] = useState(typeof initialQuery === 'string' ? initialQuery : '')
  const today = new Date().toISOString().slice(0, 10)
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Sin cliente'
  const estimateOf = (id: string) => estimates.find((e) => e.id === id)
  const q = query.trim().toLowerCase()
  const visible = invoices.filter(
    (i) =>
      (status === 'all' || i.status === status) &&
      (clientId === 'all' || i.clientId === clientId) &&
      (q === '' ||
        [i.number, i.concept, clientName(i.clientId), estimateOf(i.estimateId)?.number ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q)),
  )
  const pager = usePagination(visible, `${status}|${clientId}|${q}`)
  const pendingCents = invoices.filter((i) => i.status !== 'paid').reduce((sum, i) => sum + i.totalCents, 0)
  const overdueCents = invoices
    .filter((i) => i.status !== 'paid' && i.dueDate < today)
    .reduce((sum, i) => sum + i.totalCents, 0)
  const filtered = status !== 'all' || clientId !== 'all' || q !== ''

  function clearFilters() {
    setStatus('all')
    setClientId('all')
    setQuery('')
  }

  function openInvoice(invoiceId: string) {
    void navigate({ to: '/facturas/$invoiceId', params: { invoiceId } })
  }

  /** Opens the invoice and the browser's print dialog, where "Guardar como PDF" downloads it. */
  function downloadInvoice(invoiceId: string) {
    void navigate({ to: '/facturas/$invoiceId', params: { invoiceId } }).then(() =>
      setTimeout(() => window.print(), 150),
    )
  }

  function actions(invoice: Invoice) {
    return (
      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" isDisabled={invoice.status === 'paid'} onPress={() => markInvoicePaid(invoice.id)}>
          {invoice.status === 'paid' ? 'Cobrada' : 'Cobrar'}
        </Button>
        <DropdownMenuTrigger>
          <Button size="sm" variant="outline" aria-label={`Más acciones de ${invoice.number}`}>
            <DotsThree weight="bold" className="size-4" />
          </Button>
          <DropdownMenuContent placement="bottom end">
            <DropdownMenuItem onAction={() => openInvoice(invoice.id)}>Ver factura</DropdownMenuItem>
            <DropdownMenuItem onAction={() => downloadInvoice(invoice.id)}>Descargar PDF</DropdownMenuItem>
            <DropdownMenuItem onAction={() => void send(invoice)}>Enviar por email</DropdownMenuItem>
            {invoice.status === 'paid' ? null : (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onAction={() => deleteInvoice(invoice.id)}>
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenuTrigger>
      </div>
    )
  }

  function dueLabel(invoice: Invoice) {
    const overdue = invoice.status !== 'paid' && invoice.dueDate < today
    return (
      <span className={overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}>
        {invoice.dueDate}
        {overdue ? ' · vencida' : ''}
      </span>
    )
  }

  async function send(invoice: Invoice) {
    const client = clients.find((c) => c.id === invoice.clientId)
    if (!client?.email) {
      toast.error('No se envió', { description: 'El cliente no tiene email. Añádelo en Clientes y vuelve a enviar.' })
      return
    }
    const sent = await sendDocument('invoice', invoice.id)
    if (sent && invoice.status === 'issued') setInvoiceStatus(invoice.id, 'sent')
  }

  return (
    <div className="space-y-8">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Facturas</PageHeaderTitle>
          <PageHeaderDescription>
            Se generan desde los hitos de pago de un presupuesto.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Pendiente de cobro" value={formatEuros(pendingCents)} tone="warning" icon={fieldIcons.euro} />
        <StatCard
          label="Vencido"
          value={formatEuros(overdueCents)}
          tone={overdueCents > 0 ? 'danger' : 'default'}
          icon={fieldIcons.bank}
        />
        <StatCard label="Facturas" value={String(invoices.length)} icon={fieldIcons.file} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          aria-label="Buscar facturas"
          className="sm:w-72"
          placeholder="Buscar por nº, concepto, cliente…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <SelectField
          label="Filtrar por estado"
          hideLabel
          className="sm:w-44"
          value={status}
          options={[
            { value: 'all', label: 'Todos los estados' },
            ...Object.entries(statusConfig).map(([value, c]) => ({ value, label: c.label })),
          ]}
          onChange={(v) => setStatus(v as 'all' | InvoiceStatus)}
        />
        <SelectField
          label="Filtrar por cliente"
          hideLabel
          className="sm:w-48"
          value={clientId}
          options={[
            { value: 'all', label: 'Todos los clientes' },
            ...clients.map((c) => ({ value: c.id, label: c.name })),
          ]}
          onChange={setClientId}
        />
        {filtered ? (
          <Button variant="ghost" size="sm" onPress={clearFilters}>
            Limpiar filtros
          </Button>
        ) : null}
        <p className="text-muted-foreground text-sm tabular-nums sm:ml-auto">
          {visible.length} {visible.length === 1 ? 'factura' : 'facturas'}
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyPanel
          icon={invoices.length === 0 ? fieldIcons.file : fieldIcons.search}
          title={invoices.length === 0 ? 'Aún no has hecho ninguna factura' : 'Ninguna factura coincide'}
          description={
            invoices.length === 0
              ? 'Las facturas se crean desde un presupuesto: ábrelo, ve a «Hitos de pago» y pulsa «Generar factura».'
              : 'Prueba con otra búsqueda o quita los filtros.'
          }
        >
          {invoices.length === 0 ? (
            <Link
              to="/presupuestos"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center rounded-md px-3 text-sm font-medium"
            >
              Ir a mis presupuestos
            </Link>
          ) : (
            <Button variant="outline" onPress={clearFilters}>
              Limpiar filtros
            </Button>
          )}
        </EmptyPanel>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {pager.pageItems.map((invoice) => {
              const { label, variant } = statusConfig[invoice.status]
              return (
                <li key={invoice.id} className="border-border bg-card space-y-3 rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-xs">{invoice.number}</p>
                      <Link
                        to="/facturas/$invoiceId"
                        params={{ invoiceId: invoice.id }}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {invoice.concept}
                      </Link>
                    </div>
                    <Badge variant={variant}>{label}</Badge>
                  </div>
                  <p className="text-xl font-semibold tabular-nums">{formatEuros(invoice.totalCents)}</p>
                  <p className="text-xs">
                    <Link to="/clientes" className="underline-offset-4 hover:underline">
                      {clientName(invoice.clientId)}
                    </Link>
                    {' · '}
                    <Link
                      to="/presupuestos/$estimateId"
                      params={{ estimateId: invoice.estimateId }}
                      className="underline-offset-4 hover:underline"
                    >
                      Presupuesto {estimateOf(invoice.estimateId)?.number ?? ''}
                    </Link>
                    {' · Vence '}
                    {dueLabel(invoice)}
                  </p>
                  {actions(invoice)}
                </li>
              )
            })}
          </ul>
          <Table containerClassName="hidden md:block">
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Presupuesto</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.pageItems.map((invoice) => {
                const { label, variant } = statusConfig[invoice.status]
                return (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => openInvoice(invoice.id)}
                  >
                    <TableCell className="whitespace-nowrap">
                      <Link
                        to="/facturas/$invoiceId"
                        params={{ invoiceId: invoice.id }}
                        className="text-muted-foreground underline-offset-4 hover:underline"
                      >
                        {invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-64 truncate font-medium">{invoice.concept}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Link to="/clientes" className="underline-offset-4 hover:underline">
                        {clientName(invoice.clientId)}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Link
                        to="/presupuestos/$estimateId"
                        params={{ estimateId: invoice.estimateId }}
                        className="underline-offset-4 hover:underline"
                      >
                        {estimateOf(invoice.estimateId)?.number ?? 'Ver'}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{dueLabel(invoice)}</TableCell>
                    <TableCell>
                      <Badge variant={variant}>{label}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatEuros(invoice.totalCents)}
                    </TableCell>
                    <TableCell>{actions(invoice)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}
      <TablePagination controller={pager} noun="facturas" />
    </div>
  )
}
