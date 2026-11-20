import { useState, type CSSProperties, type ReactNode, type Ref } from 'react'

import { documentAccent } from '@/shared/domain/document-appearance'
import { estimateTotals, milestoneAmounts } from '@/shared/domain/estimate'
import { defaultEstimateDesign, type EstimateDesign } from '@/shared/domain/estimate-design'
import { estimateSignaturePath } from '@/shared/domain/estimate-signature'
import { formatEuros } from '@/shared/domain/money'
import type { Client, Estimate, Tenant } from '@/shared/domain/types'
import { documentLogoStyle } from '@/shared/ui/document-logo-style'

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
  const design = estimate.documentDesign ?? defaultEstimateDesign
  const accentColor = documentAccent(design.appearance?.accentColor)
  const hasCover = design.layout === 'proposal'
  const hasIndex = hasCover && design.showIndex
  const Page = paginated ? EstimatePageFlow : Unpaginated
  const [pageCounts, setPageCounts] = useState<[number, number, number]>([1, 1, 1])
  const activePageCounts = [
    hasCover ? pageCounts[0] : 0,
    hasIndex ? pageCounts[1] : 0,
    pageCounts[2],
  ]
  const totalPages = activePageCounts.reduce((total, count) => total + count, 0)
  const pageProps = (group: 0 | 1 | 2) => ({
    pageCount: pageCounts[group],
    firstPage: 1 + activePageCounts.slice(0, group).reduce((total, count) => total + count, 0),
    totalPages,
    tenantName: tenant.name,
    estimateNumber: estimate.number,
    onPageCountChange: (count: number) => {
      setPageCounts((current) => {
        if (current[group] === count) return current
        const next: [number, number, number] = [...current]
        next[group] = count
        return next
      })
    },
  })
  const header = (
    <EstimateDocumentHeader
      estimate={estimate}
      tenant={tenant}
      client={client}
      cover={hasCover}
      design={design}
    />
  )

  return (
    <article
      ref={documentRef}
      data-layout={design.layout}
      style={accentColor ? ({ '--estimate-accent': accentColor } as CSSProperties) : undefined}
      className={
        paginated
          ? 'estimate-document estimate-document--paged text-sm'
          : 'estimate-document bg-card mx-auto max-w-3xl space-y-8 rounded-lg border p-4 text-sm shadow-sm sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none'
      }
    >
      {hasCover ? <Page {...pageProps(0)}>{header}</Page> : null}

      {hasIndex ? (
        <Page {...pageProps(1)}>
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
      ) : null}

      <Page {...pageProps(2)}>
        {hasCover ? null : header}
        <div className="estimate-document__content">
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
            <div className="border-t pt-2">
              Conforme del cliente
              {estimate.respondedSignature ? (
                <svg
                  className="estimate-document__signature"
                  viewBox="0 0 600 160"
                  role="img"
                  aria-label={`Firma de ${estimate.respondedBy ?? 'cliente'}`}
                >
                  <path
                    d={estimateSignaturePath(estimate.respondedSignature)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
              {estimate.respondedSignature && estimate.respondedBy ? (
                <span className="text-muted-foreground block text-[9px]">
                  Aceptado digitalmente por {estimate.respondedBy}
                  {estimate.respondedAt ? ` · ${estimate.respondedAt.slice(0, 10)}` : ''}
                </span>
              ) : null}
            </div>
          </footer>
          {design.showFooter && tenant.documentFooter ? (
            <p className="text-muted-foreground border-t pt-3 text-center text-xs whitespace-pre-line">
              {tenant.documentFooter}
            </p>
          ) : null}
        </div>
      </Page>
    </article>
  )
}

function EstimateDocumentHeader({
  estimate,
  tenant,
  client,
  cover,
  design,
}: {
  estimate: Estimate
  tenant: Tenant
  client: Client | undefined
  cover: boolean
  design: EstimateDesign
}) {
  return (
    <header
      className={cover ? 'estimate-document__cover space-y-8' : 'estimate-document__compact-header'}
    >
      <div className="estimate-document__issuer">
        {design.showLogo && tenant.logoUrl ? (
          <img
            src={tenant.logoUrl}
            alt={tenant.name}
            className="mb-3 max-h-14 max-w-44 object-contain"
            style={documentLogoStyle(design.appearance)}
          />
        ) : null}
        <h2
          className="text-xl font-semibold tracking-tight"
          style={{
            color: `var(--estimate-accent, ${documentAccent(tenant.brandColor) ?? 'inherit'})`,
          }}
        >
          {tenant.name}
        </h2>
        <p className="text-muted-foreground">
          {[tenant.taxId, tenant.phone, tenant.email].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className={cover ? 'space-y-2' : 'estimate-document__heading space-y-1'}>
        <p
          className={
            cover
              ? 'text-lg font-semibold'
              : 'estimate-document__reference text-muted-foreground font-medium'
          }
        >
          Presupuesto {estimate.number}
        </p>
        <h1 className={cover ? 'text-2xl font-semibold' : 'text-xl font-semibold'}>
          {estimate.title}
        </h1>
        <div className="estimate-document__dates text-muted-foreground">
          <p>Fecha: {estimate.createdAt}</p>
          <p>Válido hasta: {estimate.validUntil}</p>
        </div>
      </div>
      <div className="estimate-document__recipient">
        <p className="text-muted-foreground text-xs tracking-wider uppercase">Cliente</p>
        <p className="font-medium">{client?.name ?? 'Sin cliente'}</p>
        <p className="text-muted-foreground">{client?.address}</p>
      </div>
    </header>
  )
}

function Unpaginated({ children }: { children: ReactNode }) {
  return children
}
