import { Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'

import { formatEuros } from '@/shared/domain/money'

import { loadContractProfitability } from '../application/contract-profitability-actions'

export function ContractProfitabilityPanel({
  tenantId,
  contractId,
}: {
  tenantId: string
  contractId: string
}) {
  const query = useQuery({
    queryKey: ['contract-profitability', tenantId, contractId],
    queryFn: () => loadContractProfitability(tenantId, contractId),
  })
  const data = query.data
  const margin =
    data && data.activeCostCount > 0 && data.invoiceCount > 0
      ? data.billedNetCents - data.actualCostCents
      : null
  const marginPercent =
    margin !== null && data && data.billedNetCents > 0 ? (margin * 100) / data.billedNetCents : null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rentabilidad del contrato</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {query.isPending ? <output>Cargando rentabilidad…</output> : null}
        {query.isError ? <p role="alert">{query.error.message}</p> : null}
        {data ? (
          <>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt>Facturado sin IVA</dt>
                <dd className="font-semibold">{formatEuros(data.billedNetCents)}</dd>
              </div>
              <div>
                <dt>Cobrado con IVA</dt>
                <dd className="font-semibold">{formatEuros(data.collectedGrossCents)}</dd>
              </div>
              <div>
                <dt>Coste real registrado</dt>
                <dd className="font-semibold">
                  {data.activeCostCount ? formatEuros(data.actualCostCents) : 'No informado'}
                </dd>
              </div>
              <div>
                <dt>Gastos imputados adicionales sin IVA</dt>
                <dd className="font-semibold">{formatEuros(data.allocatedExpenseNetCents ?? 0)}</dd>
              </div>
              <div>
                <dt>Margen sobre facturación registrada</dt>
                <dd className="font-semibold">
                  {margin === null ? 'No calculable' : formatEuros(margin)}
                </dd>
              </div>
              <div>
                <dt>Margen porcentual</dt>
                <dd className="font-semibold">
                  {marginPercent === null
                    ? 'No calculable'
                    : `${marginPercent.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`}
                </dd>
              </div>
            </dl>
            <p className="border-warning/40 bg-warning/5 rounded-lg border p-3">
              Margen provisional: incluye facturas emitidas, costes registrados y gastos imputados
              al contrato. Los costes ausentes y gastos sin imputación no se consideran cero.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
