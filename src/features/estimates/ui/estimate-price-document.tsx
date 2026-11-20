import { estimateTotals, lineNetCents } from '@/shared/domain/estimate'
import { formatEuros } from '@/shared/domain/money'
import type { Estimate, EstimateLine } from '@/shared/domain/types'

export function EstimatePriceTable({ lines }: { lines: EstimateLine[] }) {
  return (
    <div className="estimate-document__table overflow-x-auto">
      <table className="w-full min-w-104">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className="py-2 font-medium" scope="col">
              Concepto
            </th>
            <th className="py-2 text-right font-medium" scope="col">
              Cant.
            </th>
            <th className="py-2 text-right font-medium" scope="col">
              Precio
            </th>
            <th className="py-2 text-right font-medium" scope="col">
              Importe
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b">
              <td className="py-2">
                {line.description}
                {line.details ? (
                  <span className="text-muted-foreground block text-xs whitespace-pre-line">
                    {line.details}
                  </span>
                ) : null}
                {line.discountPercent > 0 ? (
                  <span className="text-muted-foreground block text-xs">
                    Descuento {line.discountPercent}%
                  </span>
                ) : null}
              </td>
              <td className="py-2 text-right tabular-nums">
                {line.quantity} {line.unit}
              </td>
              <td className="py-2 text-right tabular-nums">{formatEuros(line.unitPriceCents)}</td>
              <td className="py-2 text-right tabular-nums">{formatEuros(lineNetCents(line))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EstimatePriceSummary({ estimate }: { estimate: Estimate }) {
  const totals = estimateTotals(estimate)
  return (
    <>
      <dl className="estimate-document__totals mt-4 ml-auto w-full space-y-1 tabular-nums sm:w-64">
        <Row label="Materiales" value={totals.materialsCents} />
        <Row label="Mano de obra" value={totals.laborCents} />
        {totals.otherCents > 0 ? <Row label="Otros" value={totals.otherCents} /> : null}
        {totals.globalDiscountCents > 0 ? (
          <Row
            label={
              estimate.discountType === 'percent'
                ? `Descuento ${estimate.discountValue}%`
                : 'Descuento'
            }
            value={-totals.globalDiscountCents}
          />
        ) : null}
        <Row label="Base imponible" value={totals.subtotalCents} />
        <Row label={`IVA ${estimate.vatRate}%`} value={totals.vatCents} />
        <div className="flex justify-between border-t pt-2 text-base font-semibold">
          <dt>
            {estimate.conversionDestination === 'contract' &&
            estimate.contractBillingFrequency !== 'once'
              ? 'Total por periodo'
              : 'Total'}
          </dt>
          <dd>{formatEuros(totals.totalCents)}</dd>
        </div>
      </dl>
      {estimate.conversionDestination === 'contract' ? (
        <p className="mt-3 text-sm font-medium">
          {estimate.contractBillingFrequency === 'once'
            ? 'Contrato · importe único'
            : `Contrato · precio por periodo ${estimate.contractBillingFrequency === 'quarterly' ? 'trimestral' : estimate.contractBillingFrequency === 'yearly' ? 'anual' : 'mensual'}`}
          . La vigencia y la planificación de cada trabajo se concretarán en el contrato.
        </p>
      ) : null}
    </>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{formatEuros(value)}</dd>
    </div>
  )
}
