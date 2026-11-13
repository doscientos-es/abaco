import type { EstimateSection } from '@/shared/domain/estimate-document'
import type { Estimate } from '@/shared/domain/types'

import { estimatePriceFrequency, sectionPriceTotal } from '../domain/estimate-section-price'
import { EstimatePriceNarrative } from './estimate-price-narrative'

export function EstimateDocumentSection({
  section,
  estimate,
}: {
  section: EstimateSection
  estimate: Estimate
}) {
  return (
    <section
      className="estimate-document__section"
      data-page-break={section.pageBreakBefore || undefined}
    >
      {section.type !== 'prices' ? (
        <h3 className="mb-3 border-b pb-2 text-base font-semibold">{section.title}</h3>
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
      {section.type === 'work_table' ? (
        <div className="estimate-document__table overflow-x-auto">
          <table className="w-full min-w-104 text-left">
            <thead>
              <tr className="border-b text-xs">
                <th scope="col" className="py-2">
                  Trabajo
                </th>
                <th scope="col" className="p-2">
                  Frecuencia
                </th>
                <th scope="col" className="py-2">
                  Detalle
                </th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row) => (
                <tr key={row.id} className="border-b align-top">
                  <td className="py-2 whitespace-pre-wrap">{row.task}</td>
                  <td className="p-2 whitespace-pre-wrap">{row.frequency}</td>
                  <td className="py-2 whitespace-pre-wrap">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {section.type === 'prices' ? (
        <EstimatePriceNarrative
          amountCents={sectionPriceTotal(estimate, section)}
          frequency={estimatePriceFrequency(estimate)}
        />
      ) : null}
    </section>
  )
}
