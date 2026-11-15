import type { Ref } from 'react'

import { estimateTotals, milestoneAmounts } from '@/shared/domain/estimate'
import { formatEuros } from '@/shared/domain/money'
import type { Client, Estimate, Tenant } from '@/shared/domain/types'

import {
  estimatePriceFrequency,
  sectionPriceNarrative,
  sectionPriceTotal,
} from '../domain/estimate-section-price'
import { EstimateDocumentSection } from './estimate-document-section'
import { EstimatePageFlow } from './estimate-page-flow'
import { EstimatePriceSummary, EstimatePriceTable } from './estimate-price-document'

import './estimate-document.css'

/** Client-facing proposal. Rendered on screen and printed/saved as PDF via the browser. */
export function EstimateDocument({
  estimate,
  client,
  tenant,
  documentRef,
  paginated = true,
}: {
  estimate: Estimate
  client: Client | undefined
  tenant: Tenant
  documentRef?: Ref<HTMLElement>
  paginated?: boolean
}) {
  const totals = estimateTotals(estimate)
  const milestones = milestoneAmounts(estimate.milestones, totals.totalCents)
  const sections = estimate.documentFormat === 'sections' ? (estimate.sections ?? []) : []
  const showPayment = estimate.conversionDestination !== 'contract'
  const showConditions = estimate.documentFormat !== 'sections' || Boolean(estimate.clauses)
  const mainSectionCount = estimate.documentFormat === 'sections' ? sections.length : 2
  const paymentNumber = mainSectionCount + 1
  const conditionsNumber = mainSectionCount + (showPayment ? 2 : 1)
  const Page = paginated ? EstimatePageFlow : Unpaginated

  return (
    <article
      ref={documentRef}
      className={
        paginated
          ? 'estimate-document estimate-document--paged text-sm'
          : 'estimate-document bg-card mx-auto max-w-3xl space-y-8 rounded-lg border p-4 text-sm shadow-sm sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none'
      }
    >
      <Page>
        <header className="estimate-document__cover space-y-8">
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
          <div className="space-y-2">
            <p className="text-lg font-semibold">Presupuesto {estimate.number}</p>
            <h1 className="text-2xl font-semibold">{estimate.title}</h1>
            <p className="text-muted-foreground">Fecha: {estimate.createdAt}</p>
            <p className="text-muted-foreground">Válido hasta: {estimate.validUntil}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs tracking-wider uppercase">Cliente</p>
            <p className="font-medium">{client?.name ?? 'Sin cliente'}</p>
            <p className="text-muted-foreground">{client?.address}</p>
          </div>
        </header>
      </Page>

      <Page>
        <nav className="estimate-document__index" aria-label="Índice">
          <h2 className="mb-5 text-xl font-semibold">Índice</h2>
          <ul className="space-y-2">
            {estimate.documentFormat === 'sections' ? (
              sections.map((section, index) => (
                <li key={section.id}>
                  {`${index + 1}. ${
                    section.type === 'prices'
                      ? sectionPriceNarrative(
                          sectionPriceTotal(estimate, section),
                          estimatePriceFrequency(estimate),
                        ).heading
                      : section.title
                  }`}
                </li>
              ))
            ) : (
              <>
                <li>1. {estimate.title}</li>
                <li>2. Resumen económico</li>
              </>
            )}
            {showPayment ? <li>{paymentNumber}. Forma de pago</li> : null}
            {showConditions ? <li>{conditionsNumber}. Descripción y condiciones</li> : null}
          </ul>
        </nav>
      </Page>

      <Page>
        <div className="estimate-document__content space-y-8">
          {estimate.documentFormat !== 'sections' ? (
            <section>
              <h3 className="mb-3 text-base font-semibold">1. {estimate.title}</h3>
              <EstimatePriceTable lines={estimate.lines} />
            </section>
          ) : null}

          {sections.map((section, index) => (
            <EstimateDocumentSection
              key={section.id}
              section={section}
              estimate={estimate}
              number={index + 1}
            />
          ))}

          {estimate.documentFormat !== 'sections' ? (
            <section aria-label="Resumen económico">
              <h3 className="mb-3 text-base font-semibold">2. Resumen económico</h3>
              <EstimatePriceSummary estimate={estimate} />
            </section>
          ) : null}

          {showPayment ? (
            <section>
              <h3 className="mb-2 text-base font-semibold">{paymentNumber}. Forma de pago</h3>
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

          {showConditions ? (
            <section>
              <h3 className="mb-2 text-base font-semibold">
                {conditionsNumber}. Descripción y condiciones
              </h3>
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
        </div>
      </Page>
    </article>
  )
}

function Unpaginated({ children }: { children: React.ReactNode }) {
  return children
}
