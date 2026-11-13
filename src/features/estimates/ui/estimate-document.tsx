import type { Ref } from 'react'

import { estimateTotals, milestoneAmounts } from '@/shared/domain/estimate'
import { formatEuros } from '@/shared/domain/money'
import type { Client, Estimate, Tenant } from '@/shared/domain/types'

import { EstimateDocumentSection } from './estimate-document-section'
import { EstimatePriceSummary, EstimatePriceTable } from './estimate-price-document'

import './estimate-document.css'

/** Client-facing proposal. Rendered on screen and printed/saved as PDF via the browser. */
export function EstimateDocument({
  estimate,
  client,
  tenant,
  documentRef,
}: {
  estimate: Estimate
  client: Client | undefined
  tenant: Tenant
  documentRef?: Ref<HTMLElement>
}) {
  const totals = estimateTotals(estimate)
  const milestones = milestoneAmounts(estimate.milestones, totals.totalCents)

  return (
    <article
      ref={documentRef}
      className="estimate-document bg-card mx-auto max-w-3xl space-y-8 rounded-lg border p-4 text-sm shadow-sm sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none"
    >
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-6">
        <div>
          {tenant.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={tenant.name}
              className="mb-3 max-h-14 max-w-44 object-contain"
            />
          ) : null}
          <h2
            className="text-xl font-semibold tracking-tight"
            style={tenant.brandColor ? { color: tenant.brandColor } : undefined}
          >
            {tenant.name}
          </h2>
          <p className="text-muted-foreground">
            {tenant.taxId} · {tenant.phone} · {tenant.email}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-lg font-semibold">Presupuesto {estimate.number}</p>
          <p className="text-muted-foreground">Fecha: {estimate.createdAt}</p>
          <p className="text-muted-foreground">Válido hasta: {estimate.validUntil}</p>
        </div>
      </header>

      <section>
        <p className="text-muted-foreground text-xs tracking-wider uppercase">Cliente</p>
        <p className="font-medium">{client?.name ?? 'Sin cliente'}</p>
        <p className="text-muted-foreground">{client?.address}</p>
      </section>

      <section>
        <h3 className="mb-3 text-base font-semibold">{estimate.title}</h3>
        {estimate.documentFormat !== 'sections' ? (
          <EstimatePriceTable lines={estimate.lines} />
        ) : null}
      </section>

      {estimate.documentFormat === 'sections'
        ? (estimate.sections ?? []).map((section) => (
            <EstimateDocumentSection key={section.id} section={section} estimate={estimate} />
          ))
        : null}

      <section aria-label="Resumen económico">
        {estimate.documentFormat === 'sections' ? (
          <h3 className="mb-3 text-base font-semibold">Resumen económico</h3>
        ) : null}
        <EstimatePriceSummary estimate={estimate} />
      </section>

      {estimate.conversionDestination !== 'contract' ? (
        <section>
          <h3 className="mb-2 text-base font-semibold">Forma de pago</h3>
          <ul className="space-y-1">
            {milestones.map((m) => (
              <li key={m.id} className="flex justify-between tabular-nums">
                <span>
                  {m.label} ({m.percent}%)
                  {m.description ? (
                    <span className="text-muted-foreground block text-xs">{m.description}</span>
                  ) : null}
                </span>
                <span>{formatEuros(m.amountCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {estimate.documentFormat !== 'sections' || estimate.clauses ? (
        <section>
          <h3 className="mb-2 text-base font-semibold">Descripción y condiciones</h3>
          <p className="text-muted-foreground whitespace-pre-line">{estimate.clauses}</p>
        </section>
      ) : null}

      <footer className="grid grid-cols-2 gap-4 pt-10 text-xs sm:gap-10">
        <div className="border-t pt-2">Firma de la empresa</div>
        <div className="border-t pt-2">Conforme del cliente</div>
      </footer>
      {tenant.documentFooter ? (
        <p className="text-muted-foreground border-t pt-3 text-center text-xs whitespace-pre-line">
          {tenant.documentFooter}
        </p>
      ) : null}
    </article>
  )
}
