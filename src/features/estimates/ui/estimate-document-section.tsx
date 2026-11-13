import type { EstimateSection } from '@/shared/domain/estimate-document'
import type { Estimate } from '@/shared/domain/types'

import { estimatePriceFrequency, sectionPriceTotal } from '../domain/estimate-section-price'
import { EstimatePriceNarrative } from './estimate-price-narrative'
import { EstimateServicesTable } from './estimate-services-table'

export function EstimateDocumentSection({
  section,
  estimate,
  number,
}: {
  section: EstimateSection
  estimate: Estimate
  number: number
}) {
  return (
    <section
      className="estimate-document__section"
      data-page-break={section.pageBreakBefore || undefined}
    >
      {section.type !== 'prices' ? (
        <h3 className="mb-3 border-b pb-2 text-base font-semibold">{`${number}. ${section.title}`}</h3>
      ) : null}
      {section.type === 'description' ? (
        <p className="whitespace-pre-wrap">{section.content}</p>
      ) : null}
      {section.type === 'list' ? (
        <ul className="list-disc space-y-2 pl-5">
          {section.items.map((item) => (
            <li key={item.id} className="whitespace-pre-wrap">
              {item.text}
            </li>
          ))}
        </ul>
      ) : null}
      {section.type === 'work_table' ? <EstimateServicesTable rows={section.rows} /> : null}
      {section.type === 'prices' ? (
        <EstimatePriceNarrative
          amountCents={sectionPriceTotal(estimate, section)}
          frequency={estimatePriceFrequency(estimate)}
          sectionNumber={number}
        />
      ) : null}
    </section>
  )
}
