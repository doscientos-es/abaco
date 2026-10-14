import { formatEuros } from '@/shared/domain/money'
import type { Client, Invoice, Tenant } from '@/shared/domain/types'

/** Client-facing invoice. Rendered on screen and printed/saved as PDF via the browser. */
export function InvoiceDocument({
  invoice,
  client,
  tenant,
}: {
  invoice: Invoice
  client: Client | undefined
  tenant: Tenant
}) {
  const baseCents = Math.round(invoice.totalCents / (1 + invoice.vatRate / 100))
  const vatCents = invoice.totalCents - baseCents
  const issuer = [tenant.address, [tenant.postalCode, tenant.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')

  return (
    <article className="invoice-document bg-card mx-auto max-w-3xl space-y-8 rounded-lg border p-4 text-sm shadow-sm sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-6">
        <div>
          {tenant.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.name} className="mb-3 max-h-14 max-w-44 object-contain" />
          ) : null}
          <h2 className="text-xl font-semibold tracking-tight" style={tenant.brandColor ? { color: tenant.brandColor } : undefined}>
            {tenant.legalName || tenant.name}
          </h2>
          <p className="text-muted-foreground">{tenant.taxId}</p>
          {issuer ? <p className="text-muted-foreground">{issuer}</p> : null}
          <p className="text-muted-foreground">
            {tenant.phone} · {tenant.email}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-lg font-semibold">Factura {invoice.number}</p>
          <p className="text-muted-foreground">Fecha: {invoice.issuedAt}</p>
          <p className="text-muted-foreground">Vencimiento: {invoice.dueDate}</p>
        </div>
      </header>

      <section>
        <p className="text-muted-foreground text-xs tracking-wider uppercase">Cliente</p>
        <p className="font-medium">{client?.name ?? 'Sin cliente'}</p>
        {client?.taxId ? <p className="text-muted-foreground">{client.taxId}</p> : null}
        <p className="text-muted-foreground">{client?.address}</p>
      </section>

      <section>
        <table className="w-full">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="py-2 font-medium">Concepto</th>
              <th className="py-2 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2">{invoice.concept}</td>
              <td className="py-2 text-right tabular-nums">{formatEuros(baseCents)}</td>
            </tr>
          </tbody>
        </table>
        <dl className="mt-4 ml-auto w-full space-y-1 tabular-nums sm:w-64">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Base imponible</dt>
            <dd>{formatEuros(baseCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">IVA {invoice.vatRate}%</dt>
            <dd>{formatEuros(vatCents)}</dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatEuros(invoice.totalCents)}</dd>
          </div>
        </dl>
      </section>

      {tenant.iban ? (
        <section>
          <h3 className="mb-1 text-base font-semibold">Forma de pago</h3>
          <p className="text-muted-foreground">
            Transferencia bancaria a {tenant.iban}, antes del {invoice.dueDate}.
          </p>
        </section>
      ) : null}

      {tenant.documentFooter ? (
        <p className="text-muted-foreground border-t pt-3 text-center text-xs whitespace-pre-line">
          {tenant.documentFooter}
        </p>
      ) : null}
    </article>
  )
}
