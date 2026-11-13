import { Input } from '@doscientos/ui'

import { contractBillingLabels } from '@/shared/domain/contract-billing'
import { clampPercent, estimateTotals } from '@/shared/domain/estimate'
import { formatEuros } from '@/shared/domain/money'
import type { CatalogItem, Estimate } from '@/shared/domain/types'
import { FormField, SelectField } from '@/shared/ui/form'

import { usePatchEstimate } from './estimate-draft-context'
import { LinesEditor } from './lines-editor'
import { PriceInput } from './price-input'

/** The same economic editor is used by both document formats. */
export function EstimatePricingEditor({
  estimate,
  catalog,
  showLines = true,
}: {
  estimate: Estimate
  catalog: CatalogItem[]
  showLines?: boolean
}) {
  const patchEstimate = usePatchEstimate()
  const totals = estimateTotals(estimate)
  return (
    <div className="space-y-4">
      {showLines ? <LinesEditor estimate={estimate} catalog={catalog} /> : null}
      {estimate.conversionDestination === 'contract' && showLines ? (
        <SelectField
          label="El importe presupuestado corresponde a"
          value={estimate.contractBillingFrequency ?? 'monthly'}
          options={Object.entries(contractBillingLabels).map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={(value) =>
            patchEstimate(estimate.id, {
              contractBillingFrequency: value as NonNullable<Estimate['contractBillingFrequency']>,
            })
          }
        />
      ) : null}
      <div className="grid gap-4 @min-[36rem]:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
        <div className="border-border bg-surface-subtle flex flex-wrap items-end gap-3 rounded-lg border p-3">
          <SelectField
            label="Descuento global"
            className="w-full @min-[36rem]:max-w-56"
            value={estimate.discountType}
            options={[
              { value: 'none', label: 'Sin descuento' },
              { value: 'percent', label: 'Porcentaje (%)' },
              { value: 'amount', label: 'Importe (€)' },
            ]}
            onChange={(discountType) =>
              patchEstimate(estimate.id, {
                discountType: discountType as Estimate['discountType'],
                discountValue: 0,
              })
            }
          />
          {estimate.discountType === 'percent' ? (
            <FormField label="Porcentaje" className="w-28">
              <Input
                type="number"
                min={0}
                max={100}
                step="any"
                value={estimate.discountValue || ''}
                onChange={(event) =>
                  patchEstimate(estimate.id, {
                    discountValue: clampPercent(Number(event.target.value) || 0),
                  })
                }
              />
            </FormField>
          ) : null}
          {estimate.discountType === 'amount' ? (
            <FormField label="Importe sin IVA (€)" className="w-28">
              <PriceInput
                label="Importe del descuento"
                cents={estimate.discountValue}
                onCommit={(discountValue) => patchEstimate(estimate.id, { discountValue })}
              />
            </FormField>
          ) : null}
        </div>
        <dl className="ml-auto w-full max-w-xs space-y-1 tabular-nums">
          {totals.lineDiscountCents + totals.globalDiscountCents > 0 ? (
            <>
              <Row label="Suma de partidas" value={totals.grossCents} />
              {totals.lineDiscountCents > 0 ? (
                <Row label="Descuentos por partida" value={-totals.lineDiscountCents} />
              ) : null}
              {totals.globalDiscountCents > 0 ? (
                <Row label="Descuento global" value={-totals.globalDiscountCents} />
              ) : null}
            </>
          ) : null}
          <Row label="Base imponible" value={totals.subtotalCents} />
          <Row label={`IVA ${estimate.vatRate}%`} value={totals.vatCents} />
          <div className="flex justify-between border-t pt-2 text-lg font-semibold">
            <dt>Total</dt>
            <dd>{formatEuros(totals.totalCents)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{formatEuros(value)}</dd>
    </div>
  )
}
