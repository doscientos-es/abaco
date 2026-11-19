import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  PageStack,
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
import {
  formatPlatformDate,
  invoiceStatusLabel,
  platformActionClass,
  PlatformBackLink,
  PlatformMessage,
  PlatformPagination,
  PlatformRowLink,
  platformRowMetaClass,
  platformRowTitleClass,
  PlatformSearchForm,
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
      <section
        aria-label="Buscador de facturas"
        className="border-border bg-card rounded-xl border"
      >
        <div className="border-border flex flex-wrap items-end gap-3 border-b p-4">
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
                value={filter ?? ''}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  const factura = invoiceFilters.find((item) => item === value)
                  void navigate({ search: invoiceSearch(q, factura) })
                }}
              >
                <option value="">Todas</option>
                <option value="issued">Con número</option>
                <option value="in_progress">Sin número</option>
              </PlatformSelect>
            )}
          </PlatformField>
          {q || filter ? (
            <Link
              to="/superadmin"
              search={{ vista: 'facturas' }}
              className="text-primary py-2 text-sm underline"
            >
              Limpiar filtros
            </Link>
          ) : null}
        </div>
        {invoices.isPending ? <output className="block p-4">Cargando facturas…</output> : null}
        {invoices.isError ? (
          <PlatformMessage
            title="No se pudieron cargar las facturas."
            onRetry={() => void invoices.refetch()}
          />
        ) : invoices.data ? (
          <>
            {invoices.data.rows.length ? (
              <ul className="divide-border divide-y">
                {invoices.data.rows.map((invoice) => (
                  <li key={invoice.id}>
                    <PlatformRowLink
                      search={{ ...search, referencia: invoice.merchant_order }}
                      aside={
                        <strong className="tabular-nums">
                          {formatEuros(invoice.amount_cents)}
                        </strong>
                      }
                    >
                      <span className={platformRowTitleClass}>
                        {invoice.invoice_number ?? `Sin número · ${invoice.merchant_order}`}
                      </span>
                      <span className={platformRowMetaClass}>
                        {invoice.company_name} ·{' '}
                        {invoiceStatusLabel(invoice.invoice_status, invoice.invoice_number)}
                      </span>
                    </PlatformRowLink>
                  </li>
                ))}
              </ul>
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
        <output>Cargando factura…</output>
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
    <dl className="border-border bg-card grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-2 sm:p-5">
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
