import { useState } from 'react'

import {
  contractBillingLabels,
  type ContractBillingFrequency,
} from '@/shared/domain/contract-billing'
import type { Estimate } from '@/shared/domain/types'
import { newId } from '@/shared/store/store'
import { FormField, SelectField } from '@/shared/ui/form'

import {
  changeSectionPrice,
  estimatePriceFrequency,
  sectionPriceBeforeDiscount,
  sectionPriceTotal,
  type PriceSection,
} from '../domain/estimate-section-price'
import { usePatchEstimate } from './estimate-draft-context'
import { EstimatePriceNarrative } from './estimate-price-narrative'
import { PriceInput } from './price-input'

export function EstimateSectionPriceEditor({
  estimate,
  section,
}: {
  estimate: Estimate
  section: PriceSection
}) {
  const patchEstimate = usePatchEstimate()
  const [error, setError] = useState<string | null>(null)
  const frequency = estimatePriceFrequency(estimate)
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Precio con impuestos incluidos (€)">
          <PriceInput
            label="Precio con impuestos incluidos"
            cents={sectionPriceBeforeDiscount(estimate, section)}
            onCommit={(cents) => {
              const result = changeSectionPrice(estimate, section, cents, newId)
              if (!result.ok) {
                setError(result.error)
                return
              }
              setError(null)
              patchEstimate(estimate.id, result.patch)
            }}
          />
        </FormField>
        <SelectField
          label="Periodicidad del precio"
          value={frequency}
          options={Object.entries(contractBillingLabels).map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={(value) =>
            patchEstimate(estimate.id, {
              contractBillingFrequency: value as ContractBillingFrequency,
            })
          }
        />
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {section.lineIds.length > 1 ? (
        <p className="text-muted-foreground text-xs">
          Al cambiar el precio, las partidas de esta sección se resumirán en un único importe.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        La periodicidad se aplica a todo el presupuesto.
        {estimate.discountType !== 'none'
          ? ' Introduce el precio antes del descuento global; la redacción incluye el descuento aplicado.'
          : ''}
      </p>
      <div aria-label="Redacción del precio" className="bg-muted/30 rounded-lg border p-4 text-sm">
        <EstimatePriceNarrative
          amountCents={sectionPriceTotal(estimate, section)}
          frequency={frequency}
        />
      </div>
    </div>
  )
}
