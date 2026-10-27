import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { formatEuros, parseEuros } from '@/shared/domain/money'

import {
  createContractPeriodInvoiceDraft,
  generateContractBillingPeriods,
  listContractBillingPeriods,
  listOpenContractBillingJobErrors,
  valueContractBillingPeriod,
} from '../application/contract-billing-actions'

export function ContractBillingPanel({
  tenantId,
  contractId,
  canGenerate,
  timezone,
  priceCents,
}: {
  tenantId: string
  contractId: string
  canGenerate: boolean
  timezone: string
  priceCents: number
}) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [valuingId, setValuingId] = useState<string | null>(null)
  const [valuationAmount, setValuationAmount] = useState('')
  const [valuationReason, setValuationReason] = useState('')
  const queryKey = ['contract-billing-periods', tenantId, contractId]
  const query = useQuery({
    queryKey: [...queryKey, page],
    queryFn: () => listContractBillingPeriods(tenantId, contractId, page),
  })
  const errors = useQuery({
    queryKey: ['contract-billing-errors', tenantId, contractId],
    queryFn: () => listOpenContractBillingJobErrors(tenantId, contractId),
  })

  async function generate() {
    if (busy || !canGenerate) return
    setBusy(true)
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).formatToParts(new Date())
      const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
      const today = `${part('year')}-${part('month')}-${part('day')}`
      const count = await generateContractBillingPeriods(tenantId, contractId, today)
      setPage(0)
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({
        queryKey: ['contract-billing-errors', tenantId, contractId],
      })
      toast.success(`${count} periodos nuevos registrados`)
    } catch (error) {
      toast.error('No se pudieron generar los periodos', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function valuePeriod(periodId: string) {
    const netCents = parseEuros(valuationAmount)
    if (
      busy ||
      !/^\d+(?:[.,]\d{1,2})?$/.test(valuationAmount.trim()) ||
      !Number.isSafeInteger(netCents) ||
      netCents < 0 ||
      netCents > priceCents ||
      !valuationReason.trim()
    )
      return
    setBusy(true)
    try {
      await valueContractBillingPeriod(tenantId, periodId, netCents, valuationReason.trim())
      setValuingId(null)
      setValuationAmount('')
      setValuationReason('')
      await queryClient.invalidateQueries({ queryKey })
      toast.success('Periodo valorado')
    } catch (error) {
      toast.error('No se pudo valorar el periodo', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function prepareDraft(periodId: string) {
    if (busy) return
    setBusy(true)
    try {
      await createContractPeriodInvoiceDraft(tenantId, periodId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ['invoice-contract-period-drafts', tenantId] }),
      ])
      toast.success('Borrador preparado; revísalo en Facturas')
    } catch (error) {
      toast.error('No se pudo preparar el borrador', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Periodos facturables</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Cada día se preparan periodos completos y borradores con precio validado. El precio y el
          IVA quedan fijados en cada periodo. Las cuotas parciales o afectadas por pausas requieren
          valoración de oficina. La factura se revisa y emite en Facturas.
        </p>
        {canGenerate ? (
          <Button onPress={() => void generate()} isDisabled={busy}>
            Generar periodos completos
          </Button>
        ) : null}
        {query.isPending ? <output>Cargando periodos…</output> : null}
        {query.isError ? <p role="alert">{query.error.message}</p> : null}
        {errors.isError ? (
          <p role="alert">No se pudieron cargar los avisos de generación.</p>
        ) : null}
        {errors.data?.length ? (
          <div
            role="alert"
            className="border-warning/40 bg-warning/5 space-y-2 rounded-lg border p-3"
          >
            <p className="font-medium">La preparación automática necesita revisión</p>
            <ul className="list-inside list-disc">
              {errors.data.map((error) => (
                <li key={error.id}>
                  {error.message} · {error.occurrences} intentos
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {query.data ? (
          <>
            {query.data.periods.length ? (
              <ul className="divide-y rounded-lg border">
                {query.data.periods.map((period) => {
                  const netCents =
                    period.pricing_status === 'priced'
                      ? period.net_cents
                      : period.valuation?.net_cents
                  return (
                    <li key={period.id} className="space-y-3 p-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span>
                          {period.period_start_on} → {period.period_end_on}
                        </span>
                        <span className="font-medium">
                          {netCents !== null && netCents !== undefined
                            ? `${formatEuros(netCents)} sin IVA · ${period.vat_rate}% IVA`
                            : `Valoración pendiente · ${period.review_reason ?? 'Revisión requerida'}`}
                        </span>
                      </div>
                      {period.invoice_draft_id ? (
                        <Link to="/facturas" className="text-primary underline">
                          Ver borrador o factura
                        </Link>
                      ) : netCents !== null && netCents !== undefined && netCents > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          isDisabled={busy}
                          onPress={() => void prepareDraft(period.id)}
                        >
                          Preparar borrador
                        </Button>
                      ) : null}
                      {period.pricing_status === 'requires_review' && !period.valuation ? (
                        valuingId === period.id ? (
                          <div className="space-y-2 rounded-lg border p-3">
                            <p>
                              Valora este periodo entre 0 € y {formatEuros(priceCents)} sin IVA.{' '}
                              {period.review_reason}
                            </p>
                            <label className="block">
                              Importe sin IVA, €
                              <input
                                value={valuationAmount}
                                onChange={(event) => setValuationAmount(event.target.value)}
                                className="border-input bg-background mt-1 block w-full rounded-lg border px-3 py-2"
                                placeholder="0,00"
                              />
                            </label>
                            <label className="block">
                              Motivo de la valoración
                              <textarea
                                value={valuationReason}
                                onChange={(event) => setValuationReason(event.target.value)}
                                maxLength={2000}
                                className="border-input bg-background mt-1 block w-full rounded-lg border px-3 py-2"
                              />
                            </label>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                isDisabled={
                                  busy ||
                                  !valuationReason.trim() ||
                                  !/^\d+(?:[.,]\d{1,2})?$/.test(valuationAmount.trim()) ||
                                  parseEuros(valuationAmount) > priceCents
                                }
                                onPress={() => void valuePeriod(period.id)}
                              >
                                Guardar valoración
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onPress={() => setValuingId(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onPress={() => {
                              setValuingId(period.id)
                              setValuationAmount('')
                              setValuationReason('')
                            }}
                          >
                            Valorar periodo
                          </Button>
                        )
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p>No hay periodos generados.</p>
            )}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onPress={() => setPage(page - 1)}
                isDisabled={page === 0}
              >
                Anterior
              </Button>
              <span>Página {page + 1}</span>
              <Button
                variant="outline"
                size="sm"
                onPress={() => setPage(page + 1)}
                isDisabled={(page + 1) * query.data.pageSize >= query.data.count}
              >
                Siguiente
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
