import type { CSSProperties, Ref } from 'react'

import { formatEuros } from '@/shared/domain/money'
import type { Client, Invoice, Tenant } from '@/shared/domain/types'

import './invoice-document.css'

const dateFormatter = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC' })
const dateLabel = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

/** One fixed A4 document for both the scaled preview and the browser's Save as PDF. */
export function InvoiceDocument({
  invoice,
  client,
  tenant,
  estimateNumber,
  documentRef,
}: {
  invoice: Invoice
  client: Client | undefined
  tenant: Tenant
  estimateNumber?: string | undefined
  documentRef?: Ref<HTMLElement>
}) {
  const baseCents = Math.round(invoice.totalCents / (1 + invoice.vatRate / 100))
  const vatCents = invoice.totalCents - baseCents
  const locality = [tenant.postalCode, tenant.city].filter(Boolean).join(' ')
  const contact = [tenant.phone, tenant.email].filter(Boolean).join(' · ')
  const brandColor = /^#[0-9a-f]{6}$/i.test(tenant.brandColor?.trim() ?? '')
    ? tenant.brandColor?.trim()
    : '#2a4227'
  const style = { '--invoice-brand': brandColor } as CSSProperties

  return (
    <article
      ref={documentRef}
      aria-label={`Factura ${invoice.number}`}
      className="invoice-document invoice-sheet"
      style={style}
    >
      <header className="invoice-sheet-header">
        <div className="invoice-sheet-identity">
          {tenant.logoUrl?.trim() ? (
            <img src={tenant.logoUrl.trim()} alt={tenant.name} className="invoice-sheet-logo" />
          ) : null}
          <h2 className="invoice-sheet-company">{tenant.name}</h2>
          {tenant.legalName && tenant.legalName !== tenant.name ? <p>{tenant.legalName}</p> : null}
          {tenant.taxId ? <p>NIF / CIF: {tenant.taxId}</p> : null}
          {tenant.address ? <p className="invoice-sheet-address">{tenant.address}</p> : null}
          {locality ? <p>{locality}</p> : null}
          {contact ? <p className="invoice-sheet-contact">{contact}</p> : null}
          {tenant.website ? <p>{tenant.website}</p> : null}
        </div>
        <div className="invoice-sheet-reference">
          <p className="invoice-sheet-label">Factura</p>
          <p className="invoice-sheet-number">{invoice.number}</p>
          <dl className="invoice-sheet-dates">
            <div>
              <dt>Fecha de emisión</dt>
              <dd>{dateLabel(invoice.issuedAt)}</dd>
            </div>
            <div>
              <dt>Vencimiento</dt>
              <dd>{dateLabel(invoice.dueDate)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section aria-label="Datos del cliente" className="invoice-sheet-client">
        <div>
          <p className="invoice-sheet-label">Facturar a</p>
          <h3>{client?.name ?? 'Sin cliente'}</h3>
          {client?.taxId ? <p>NIF / CIF: {client.taxId}</p> : null}
          {client?.address ? <p className="invoice-sheet-address">{client.address}</p> : null}
          {client?.email ? <p>{client.email}</p> : null}
        </div>
        {estimateNumber ? (
          <div className="invoice-sheet-origin">
            <p className="invoice-sheet-label">Presupuesto de referencia</p>
            <p>{estimateNumber}</p>
          </div>
        ) : null}
      </section>

      <section aria-label="Detalle de la factura" className="invoice-sheet-details">
        <table className="invoice-sheet-lines">
          <thead>
            <tr>
              <th scope="col">Concepto</th>
              <th scope="col" className="invoice-sheet-rate">
                IVA
              </th>
              <th scope="col" className="invoice-sheet-amount">
                Importe
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="invoice-sheet-concept">{invoice.concept}</td>
              <td className="invoice-sheet-rate">{invoice.vatRate}%</td>
              <td className="invoice-sheet-amount">{formatEuros(baseCents)}</td>
            </tr>
          </tbody>
        </table>
        <dl className="invoice-sheet-totals">
          <div>
            <dt>Base imponible</dt>
            <dd>{formatEuros(baseCents)}</dd>
          </div>
          <div>
            <dt>IVA {invoice.vatRate}%</dt>
            <dd>{formatEuros(vatCents)}</dd>
          </div>
          <div className="invoice-sheet-total">
            <dt>Total factura</dt>
            <dd>{formatEuros(invoice.totalCents)}</dd>
          </div>
        </dl>
        {invoice.status === 'paid' ? (
          <p className="invoice-sheet-settled">Factura cobrada · Sin importe pendiente.</p>
        ) : null}
      </section>

      <footer className="invoice-sheet-footer">
        {tenant.iban ? (
          <section aria-label="Forma de pago" className="invoice-sheet-payment">
            <p className="invoice-sheet-label">Forma de pago</p>
            <h3>Transferencia bancaria</h3>
            <p className="invoice-sheet-iban">IBAN: {tenant.iban}</p>
            {invoice.status !== 'paid' ? (
              <>
                <p>Indica {invoice.number} como concepto de la transferencia.</p>
                <p>Fecha límite de pago: {dateLabel(invoice.dueDate)}.</p>
              </>
            ) : null}
          </section>
        ) : null}
        {tenant.documentFooter ? (
          <p className="invoice-sheet-legal">{tenant.documentFooter}</p>
        ) : null}
      </footer>
    </article>
  )
}
