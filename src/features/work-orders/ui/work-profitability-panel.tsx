import { Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'

import { formatEuros } from '@/shared/domain/money'

import { loadWorkProfitability } from '../application/work-profitability-actions'
import { workProfitability } from '../domain/work-profitability'

export function WorkProfitabilityPanel({
  tenantId,
  workOrderId,
  acceptedNetCents,
}: {
  tenantId: string
  workOrderId: string
  acceptedNetCents: number | null
}) {
  const query = useQuery({
    queryKey: ['work-profitability', tenantId, workOrderId],
    queryFn: () => loadWorkProfitability(tenantId, workOrderId),
  })
  const numbers = query.data ? workProfitability(acceptedNetCents, query.data) : null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rentabilidad del trabajo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {query.isPending ? <output>Cargando rentabilidad…</output> : null}
        {query.isError ? <p role="alert">{query.error.message}</p> : null}
        {numbers && query.data ? (
          <>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt>Venta aprobada sin IVA</dt>
                <dd className="font-semibold">
                  {numbers.saleNetCents === null
                    ? 'No informada'
                    : formatEuros(numbers.saleNetCents)}
                </dd>
              </div>
              <div>
                <dt>Facturado sin IVA</dt>
                <dd className="font-semibold">{formatEuros(query.data.billedNetCents)}</dd>
              </div>
              <div>
                <dt>Cobrado con IVA</dt>
                <dd className="font-semibold">{formatEuros(query.data.collectedGrossCents)}</dd>
              </div>
              <div>
                <dt>Coste real registrado</dt>
                <dd className="font-semibold">
                  {numbers.recordedCostCents === null
                    ? 'No informado'
                    : formatEuros(numbers.recordedCostCents)}
                </dd>
              </div>
              <div>
                <dt>Gastos imputados adicionales sin IVA</dt>
                <dd className="font-semibold">
                  {formatEuros(query.data.allocatedExpenseNetCents ?? 0)}
                </dd>
              </div>
              <div>
                <dt>Margen sobre facturación registrada</dt>
                <dd className="font-semibold">
                  {numbers.billedMarginCents === null
                    ? 'No calculable'
                    : formatEuros(numbers.billedMarginCents)}
                </dd>
              </div>
              <div>
                <dt>Margen porcentual</dt>
                <dd className="font-semibold">
                  {numbers.billedMarginPercent === null
                    ? 'No calculable'
                    : `${numbers.billedMarginPercent.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`}
                </dd>
              </div>
            </dl>
            <p className="border-warning/40 bg-warning/5 rounded-lg border p-3">
              Datos de costes incompletos: se incluyen los costes registrados y gastos imputados a
              este trabajo. Los gastos generales sin imputación quedan fuera. El margen es
              provisional hasta completar horas, materiales y demás costes.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
