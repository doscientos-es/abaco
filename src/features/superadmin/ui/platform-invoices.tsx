import {
  Badge,
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { ArrowSquareOut, DotsThreeVertical, Receipt } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'

import { formatEuros } from '@/shared/domain/money'

import {
  platformInvoiceQuery,
  platformInvoicesQuery,
  type PlatformInvoice,
} from '../application/platform-billing'
import { platformCompanyQuery } from '../application/superadmin-queries'
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
  const tenantId = search.empresa
  const navigate = useNavigate({ from: '/superadmin' })
  const invoices = useQuery(platformInvoicesQuery(userId, q, page, filter, tenantId))
  const company = useQuery({ ...platformCompanyQuery(tenantId ?? ''), enabled: Boolean(tenantId) })
  const isScoped = Boolean(tenantId)
  const updateFilters = (query: string, status: typeof filter, nextPage = 1) =>
    void navigate({ search: invoiceSearch(query, status, nextPage, tenantId) })

  return (
    <PageStack>
      {tenantId ? (
        <PlatformBackLink search={{ empresa: tenantId, seccion: 'pagos' }}>
          Volver a los pagos de la empresa
        </PlatformBackLink>
      ) : null}
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>
            {company.data
              ? `Facturas de ${company.data.name}`
              : isScoped
                ? 'Facturas de la empresa'
                : 'Facturas de suscripción'}
          </PageHeaderTitle>
          <PageHeaderDescription>
            {isScoped
              ? 'Solo se muestran las facturas vinculadas a esta empresa.'
              : 'Consulta las facturas de Menos Líos y su envío. Backoffice emite las nuevas suscripciones en la serie ML-SUS.'}
          </PageHeaderDescription>
        </PageHeaderHeading>
        {isScoped ? (
          <Link to="/superadmin" search={{ vista: 'facturas' }} className={platformActionClass}>
            Ver todas las facturas
          </Link>
        ) : null}
      </PageHeader>
      {isScoped ? null : <PlatformIssuer userId={userId} />}
      <section aria-label="Buscador de facturas" className={platformPanelClass}>
        <div className="border-border flex flex-wrap items-end gap-2 border-b p-3">
          <PlatformSearchForm
            query={q}
            label="Buscar factura"
            placeholder={
              isScoped ? 'N.º de factura o referencia' : 'Empresa, n.º de factura o referencia'
            }
            onSearch={(value) => updateFilters(value, filter)}
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
                  updateFilters(q, factura)
                }}
              />
            )}
          </PlatformField>
          {q || filter ? (
            <Link
              to="/superadmin"
              search={invoiceSearch('', undefined, 1, tenantId)}
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
              <PlatformMessage
                title={
                  page > 1
                    ? 'No hay más facturas'
                    : q || filter
                      ? 'No encontramos facturas'
                      : 'Aún no hay facturas de suscripción'
                }
              >
                {page > 1
                  ? 'Vuelve a la página anterior.'
                  : q || filter
                    ? 'Prueba con otra búsqueda o cambia el filtro.'
                    : 'Aparecerán aquí cuando Backoffice reciba un cobro para facturar.'}
              </PlatformMessage>
            )}
            <PlatformPagination
              page={page}
              count={invoices.data.rows.length}
              hasMore={invoices.data.hasMore}
              onChange={(nextPage) => updateFilters(q, filter, nextPage)}
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
  const navigate = useNavigate({ from: '/superadmin' })
  const showCompany = !search.empresa
  return (
    <Table density="compact" aria-label="Facturas de suscripción">
      <TableHeader className="bg-muted/40">
        <TableRow>
          <TableHead scope="col">Factura</TableHead>
          {showCompany ? (
            <TableHead scope="col" className="hidden lg:table-cell">
              Empresa
            </TableHead>
          ) : null}
          <TableHead scope="col" className="hidden lg:table-cell">
            Fecha de cobro
          </TableHead>
          <TableHead scope="col" className="hidden lg:table-cell">
            Estado
          </TableHead>
          <TableHead scope="col" className="text-right">
            Importe
          </TableHead>
          <TableHead scope="col" className="text-right">
            <span className="sr-only">Acciones</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => {
          const status = invoiceStatusLabel(invoice.invoice_status, invoice.invoice_number)
          const label = invoice.invoice_number ?? `Sin número · ${invoice.merchant_order}`
          const target = { ...search, referencia: invoice.merchant_order }
          const url = invoice.invoice_number ? invoiceLink(invoice.invoice_portal_url) : null
          const date = formatPlatformDate(invoice.paid_at)
          return (
            <TableRow key={invoice.id} className="align-top">
              <TableCell className="min-w-0 py-3 whitespace-normal">
                <PlatformRecordLink search={target}>{label}</PlatformRecordLink>
                <div className="mt-1 space-y-1.5 lg:hidden">
                  <p className="text-muted-foreground text-xs">
                    {showCompany ? `${invoice.company_name} · ` : ''}
                    {date}
                  </p>
                  <InvoiceStatus status={invoice.invoice_status} label={status} />
                </div>
              </TableCell>
              {showCompany ? (
                <TableCell className="text-muted-foreground hidden py-3 whitespace-normal lg:table-cell">
                  {invoice.company_name}
                </TableCell>
              ) : null}
              <TableCell className="text-muted-foreground hidden py-3 lg:table-cell">
                {date}
              </TableCell>
              <TableCell className="hidden py-3 whitespace-normal lg:table-cell">
                <InvoiceStatus status={invoice.invoice_status} label={status} />
              </TableCell>
              <TableCell className="py-3 text-right font-semibold tabular-nums">
                {formatEuros(invoice.amount_cents)}
              </TableCell>
              <TableCell className="w-12 px-1 py-1.5 text-right sm:w-14 sm:px-2">
                <DropdownMenuTrigger>
                  <Button
                    variant="ghost"
                    className="size-10 p-0 sm:size-11"
                    aria-label={`Acciones de factura ${label}`}
                  >
                    <DotsThreeVertical aria-hidden="true" weight="bold" className="size-5" />
                  </Button>
                  <DropdownMenuContent placement="bottom end">
                    <DropdownMenuItem
                      id="details"
                      onAction={() => void navigate({ search: target })}
                    >
                      <Receipt aria-hidden="true" /> Ver detalle
                    </DropdownMenuItem>
                    {url ? (
                      <DropdownMenuItem id="portal" href={url} target="_blank" rel="noreferrer">
                        <ArrowSquareOut aria-hidden="true" /> Abrir factura en Backoffice
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenuTrigger>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function InvoiceStatus({ status, label }: { status: string | null; label: string }) {
  const variant =
    status === 'sent'
      ? 'success'
      : status?.endsWith('_review') || status === 'retrying'
        ? 'danger'
        : status
          ? 'warning'
          : 'neutral'
  return (
    <Badge variant={variant} icon={false} className="h-auto whitespace-normal">
      {label}
    </Badge>
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
  const query = useQuery(platformInvoiceQuery(userId, reference, search.empresa))
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
