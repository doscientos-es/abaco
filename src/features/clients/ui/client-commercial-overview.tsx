import { Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { invoiceOutstandingCents } from '@/features/invoices/domain/invoice-collection'
import { estimateTotalCents } from '@/shared/domain/estimate'
import { formatEuros } from '@/shared/domain/money'
import type { Estimate, Invoice } from '@/shared/domain/types'
import { calendarDate } from '@/shared/lib/date-range'

import { selectClientCommercialOverview } from '../domain/client-commercial-overview'

const shortDate = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const formatDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? shortDate.format(calendarDate(value)) : null
const documentLink =
  'hover:bg-muted focus-visible:ring-ring -mx-1 flex min-h-11 items-center justify-between gap-2 rounded-md px-1 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none'

function DocumentRows<T extends { id: string }>({
  items,
  renderLink,
}: {
  items: readonly T[]
  renderLink: (item: T) => ReactNode
}) {
  const list = (rows: readonly T[]) => (
    <ul className="divide-border divide-y">
      {rows.map((item) => (
        <li key={item.id}>{renderLink(item)}</li>
      ))}
    </ul>
  )
  return (
    <>
      {list(items.slice(0, 3))}
      {items.length > 3 ? (
        <details>
          <summary className="text-primary focus-visible:ring-ring min-h-11 cursor-pointer content-center text-sm font-medium focus-visible:ring-2">
            Ver {items.length - 3} más
          </summary>
          {list(items.slice(3))}
        </details>
      ) : null}
    </>
  )
}

export function ClientCommercialOverview({
  tenantId,
  clientId,
  estimates,
  invoices,
}: {
  tenantId: string
  clientId: string
  estimates: readonly Estimate[] | null
  invoices: readonly Invoice[] | null
}) {
  if (!estimates && !invoices) return null
  const { sent, outstanding, outstandingCents } = selectClientCommercialOverview(
    tenantId,
    clientId,
    estimates ?? [],
    invoices ?? [],
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>Presupuestos y cobros</CardTitle>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 lg:grid-cols-2">
        {estimates ? (
          <section
            aria-label="Presupuestos sin respuesta"
            className="border-border min-w-0 rounded-xl border p-3"
          >
            <h3 className="text-sm font-semibold">
              Sin respuesta <span className="text-muted-foreground">· {sent.length}</span>
            </h3>
            {sent.length ? (
              <DocumentRows
                items={sent}
                renderLink={(item) => (
                  <Link
                    to="/presupuestos/$estimateId"
                    params={{ estimateId: item.id }}
                    className={documentLink}
                  >
                    <span className="min-w-0 break-words">
                      <span className="block font-medium">{item.title}</span>
                      <span className="text-muted-foreground block text-xs">
                        {item.number}
                        {formatDate(item.validUntil)
                          ? ` · Vigencia: ${formatDate(item.validUntil)}`
                          : ''}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatEuros(estimateTotalCents(item))}
                    </span>
                  </Link>
                )}
              />
            ) : (
              <p className="text-muted-foreground mt-2 text-sm">
                No hay presupuestos pendientes de respuesta.
              </p>
            )}
          </section>
        ) : null}
        {invoices ? (
          <section
            aria-label="Facturas con saldo pendiente"
            className="border-border min-w-0 rounded-xl border p-3"
          >
            <h3 className="text-sm font-semibold">
              Por cobrar <span className="text-muted-foreground">· {outstanding.length}</span>
            </h3>
            {outstanding.length ? (
              <>
                <p className="my-1 text-xl font-semibold tabular-nums">
                  {formatEuros(outstandingCents)}
                </p>
                <DocumentRows
                  items={outstanding}
                  renderLink={(item) => (
                    <Link
                      to="/facturas/$invoiceId"
                      params={{ invoiceId: item.id }}
                      className={documentLink}
                    >
                      <span className="min-w-0 break-words">
                        <span className="block font-medium">{item.concept}</span>
                        <span className="text-muted-foreground block text-xs">
                          {item.number}
                          {formatDate(item.dueDate) ? ` · Vence: ${formatDate(item.dueDate)}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatEuros(invoiceOutstandingCents(item))}
                      </span>
                    </Link>
                  )}
                />
              </>
            ) : (
              <p className="text-muted-foreground mt-2 text-sm">
                No hay facturas con saldo pendiente.
              </p>
            )}
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}
