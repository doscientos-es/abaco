import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  PageStack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'

import { formatEuros } from '@/shared/domain/money'

import {
  platformInvoiceQuery,
  platformInvoicesQuery,
  type PlatformInvoice,
} from '../application/platform-billing'
import {
  companyFromInvoice,
  invoiceFilters,
  invoiceNavigation,
  invoiceSearch,
  type PlatformSearch,
} from '../domain/platform-navigation'
import { PlatformField, PlatformSelect } from './platform-form-field'
import { PlatformIssuer } from './platform-issuer'
import {
  formatPlatformDate,
  invoiceStatusLabel,
  platformActionClass,
  PlatformBackLink,
  PlatformLoading,
  PlatformMessage,
  platformPanelClass,
  PlatformPagination,
  PlatformRecordLink,
  PlatformSearchForm,
  platformTextActionClass,
} from './platform-ui'

const invoiceLink = (value: string | null) => {
  const url = value ? URL.parse(value) : null
  return url?.protocol === 'https:' && !url.username && !url.password ? url.href : null
}

export function PlatformInvoices({ search, userId }: { search: PlatformSearch; userId: string }) {
  if (search.referencia) {
    return <PlatformInvoiceDetail search={search} userId={userId} reference={search.referencia} />
  }
  return <PlatformInvoiceList search={search} userId={userId} />
}

function PlatformInvoiceList({ search, userId }: { search: PlatformSearch; userId: string }) {
  const page = search.page ?? 1
  const q = search.q ?? ''
  const filter = search.factura
  const navigate = useNavigate({ from: '/superadmin' })
  const invoices = useQuery(platformInvoicesQuery(userId, q, page, filter))

  return (
    <PageStack>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Facturas de suscripción</PageHeaderTitle>
          <PageHeaderDescription>
            Consulta las facturas de Ábaco que gestiona Backoffice y el estado de su envío.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>
      <PlatformIssuer userId={userId} />
      <section aria-label="Buscador de facturas" className={platformPanelClass}>
        <div className="border-border flex flex-wrap items-end gap-2 border-b p-3">
          <PlatformSearchForm
            query={q}
            label="Buscar factura"
            placeholder="Empresa, nº de factura o referencia"
            onSearch={(value) => void navigate({ search: invoiceSearch(value, filter) })}
          />
          <PlatformField label="Numeración de factura" className="flex-1 sm:flex-none">
            {(control) => (
              <PlatformSelect
                {...control}
                value={filter ?? 'all'}
                options={[
                  { id: 'all', label: 'Todas' },
                  { id: 'issued', label: 'Con número' },
                  { id: 'in_progress', label: 'Sin número' },
                ]}
                onChange={(value) => {
                  const factura = invoiceFilters.find((item) => item === value)
                  void navigate({ search: invoiceSearch(q, factura) })
                }}
              />
            )}
          </PlatformField>
          {q || filter ? (
            <Link
              to="/superadmin"
              search={{ vista: 'facturas' }}
              className={platformTextActionClass}
            >
              Limpiar filtros
            </Link>
          ) : null}
        </div>
        {invoices.isPending ? <PlatformLoading>Cargando facturas…</PlatformLoading> : null}
        {invoices.isError ? (
          <PlatformMessage
            title="No se pudieron cargar las facturas."
            onRetry={() => void invoices.refetch()}
          />
        ) : invoices.data ? (
          <>
            {invoices.data.rows.length ? (
              <InvoiceTable invoices={invoices.data.rows} search={search} />
            ) : (
              <PlatformMessage title={page > 1 ? 'No hay más facturas' : 'No encontramos facturas'}>
                {page > 1
                  ? 'Vuelve a la página anterior.'
                  : 'Prueba con otra búsqueda o cambia el filtro.'}
              </PlatformMessage>
            )}
            <PlatformPagination
              page={page}
              count={invoices.data.rows.length}
              hasMore={invoices.data.hasMore}
              onChange={(nextPage) => void navigate({ search: invoiceSearch(q, filter, nextPage) })}
            />
          </>
        ) : null}
      </section>
    </PageStack>
  )
}

function InvoiceTable({
  invoices,
  search,
}: {
  invoices: PlatformInvoice[]
  search: PlatformSearch
}) {
  return (
    <Table density="compact" aria-label="Facturas de suscripción">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Factura</TableHead>
          <TableHead scope="col" className="hidden md:table-cell">
            Estado
          </TableHead>
          <TableHead scope="col" className="text-right">
            Importe
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => {
          const status = invoiceStatusLabel(invoice.invoice_status, invoice.invoice_number)
          return (
            <TableRow key={invoice.id}>
              <TableCell className="whitespace-normal">
                <PlatformRecordLink search={{ ...search, referencia: invoice.merchant_order }}>
                  {invoice.invoice_number ?? `Sin número · ${invoice.merchant_order}`}
                </PlatformRecordLink>
                <p className="text-muted-foreground text-xs">{invoice.company_name}</p>
                <p className="text-muted-foreground text-xs md:hidden">{status}</p>
              </TableCell>
              <TableCell className="text-muted-foreground hidden whitespace-normal md:table-cell">
                {status}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatEuros(invoice.amount_cents)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function PlatformInvoiceDetail({
  search,
  userId,
  reference,
}: {
  search: PlatformSearch
  userId: string
  reference: string
}) {
  const query = useQuery(platformInvoiceQuery(userId, reference))
  const invoice = query.data
  const url = invoice?.invoice_number ? invoiceLink(invoice.invoice_portal_url) : null

  return (
    <PageStack className="max-w-3xl">
      <PlatformBackLink search={invoiceNavigation(search)}>Volver a facturas</PlatformBackLink>
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>{invoice?.invoice_number ?? 'Detalle de factura'}</PageHeaderTitle>
          <PageHeaderDescription>
            Las facturas de suscripción se emiten y gestionan en Backoffice.
          </PageHeaderDescription>
        </PageHeaderHeading>
        {url && !query.isError ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={platformActionClass}
            aria-label={`Abrir factura ${invoice?.invoice_number} (nueva pestaña)`}
          >
            Abrir factura
          </a>
        ) : null}
      </PageHeader>
      {query.isPending ? (
        <PlatformLoading>Cargando factura…</PlatformLoading>
      ) : query.isError ? (
        <PlatformMessage
          title="No se pudo cargar la factura."
          onRetry={() => void query.refetch()}
        />
      ) : invoice ? (
        <InvoiceFacts invoice={invoice} search={search} />
      ) : (
        <PlatformMessage title="No se ha encontrado la factura." />
      )}
    </PageStack>
  )
}

function InvoiceFacts({ invoice, search }: { invoice: PlatformInvoice; search: PlatformSearch }) {
  return (
    <dl className="border-border bg-card grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground">Empresa</dt>
        <dd className="mt-1 font-medium">
          <Link
            to="/superadmin"
            search={companyFromInvoice(search, invoice.tenant_id)}
            className="text-primary underline"
          >
            {invoice.company_name}
          </Link>
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Estado de emisión y envío</dt>
        <dd className="mt-1 font-medium">
          {invoiceStatusLabel(invoice.invoice_status, invoice.invoice_number)}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Fecha del cobro</dt>
        <dd className="mt-1 font-medium">{formatPlatformDate(invoice.paid_at)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Importe cobrado</dt>
        <dd className="mt-1 font-medium tabular-nums">{formatEuros(invoice.amount_cents)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Referencia bancaria</dt>
        <dd className="mt-1 font-medium">{invoice.merchant_order}</dd>
      </div>
    </dl>
  )
}
