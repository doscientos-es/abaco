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

import { platformInvoicesQuery } from '../application/platform-billing'
import {
  companyFromInvoice,
  invoiceFilters,
  invoiceSearch,
  type PlatformSearch,
} from '../domain/platform-navigation'
import { PlatformField, PlatformSelect } from './platform-form-field'
import {
  formatPlatformDate,
  invoiceStatusLabel,
  PlatformMessage,
  PlatformPagination,
  PlatformSearchForm,
} from './platform-ui'

const invoiceLink = (value: string | null) => {
  const url = value ? URL.parse(value) : null
  return url?.protocol === 'https:' && !url.username && !url.password ? url.href : null
}

export function PlatformInvoices({ search, userId }: { search: PlatformSearch; userId: string }) {
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
                {invoices.data.rows.map((invoice) => {
                  const url = invoice.invoice_number
                    ? invoiceLink(invoice.invoice_portal_url)
                    : null
                  return (
                    <li
                      key={invoice.id}
                      className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 break-words">
                          <strong>{invoice.invoice_number ?? 'Factura sin número'}</strong>
                          <Link
                            to="/superadmin"
                            search={companyFromInvoice(search, invoice.tenant_id)}
                            className="text-primary underline"
                          >
                            {invoice.company_name}
                          </Link>
                        </p>
                        <p className="text-muted-foreground">
                          {invoiceStatusLabel(invoice.invoice_status, invoice.invoice_number)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Cobro del {formatPlatformDate(invoice.paid_at)} · Ref.{' '}
                          {invoice.merchant_order}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-3 sm:flex-col sm:items-end sm:gap-1">
                        <strong className="tabular-nums">
                          {formatEuros(invoice.amount_cents)}
                        </strong>
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                            aria-label={`Abrir factura ${invoice.invoice_number ?? ''} (nueva pestaña)`}
                          >
                            Abrir factura
                          </a>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
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
