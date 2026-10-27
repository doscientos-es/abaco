import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { createWorkExtraInvoiceDraft } from '@/features/invoices/application/invoice-draft-actions'
import { formatEuros, parseEuros } from '@/shared/domain/money'
import { TextField } from '@/shared/ui/form'

import {
  decideWorkExtra,
  listWorkExtras,
  proposeWorkExtra,
} from '../application/work-order-actions'

const statusLabels = {
  pending: 'Pendiente de aprobación',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

export function WorkExtrasPanel({
  tenantId,
  workOrderId,
  canPropose,
}: {
  tenantId: string
  workOrderId: string
  canPropose: boolean
}) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('ud')
  const [unitPrice, setUnitPrice] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [vatRate, setVatRate] = useState('21')
  const [decisionExtraId, setDecisionExtraId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [evidence, setEvidence] = useState('')
  const [busy, setBusy] = useState(false)
  const operationIds = useRef(new Map<string, string>())
  const queryKey = ['work-extras', tenantId, workOrderId, page]
  const query = useQuery({
    queryKey,
    queryFn: () => listWorkExtras(tenantId, workOrderId, page),
  })

  const numericQuantity = Number(quantity.replace(',', '.'))
  const numericVat = Number(vatRate.replace(',', '.'))
  const priceCents = parseEuros(unitPrice)
  const costCents = parseEuros(unitCost)
  const validQuantity =
    /^\d+(?:[.,]\d{1,3})?$/.test(quantity.trim()) &&
    numericQuantity > 0 &&
    numericQuantity <= 999999999.999
  const validVat =
    /^\d+(?:[.,]\d{1,2})?$/.test(vatRate.trim()) && numericVat >= 0 && numericVat <= 100
  const validProposal =
    description.trim().length > 0 &&
    unit.trim().length > 0 &&
    validQuantity &&
    validVat &&
    /^\d+(?:[.,]\d{1,2})?$/.test(unitPrice.trim()) &&
    /^\d+(?:[.,]\d{1,2})?$/.test(unitCost.trim()) &&
    Number.isSafeInteger(priceCents) &&
    priceCents > 0 &&
    Number.isSafeInteger(costCents) &&
    costCents >= 0 &&
    Math.round(numericQuantity * Math.max(priceCents, costCents)) <= 9000000000000000

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['work-extras', tenantId, workOrderId] })
    await queryClient.invalidateQueries({ queryKey: ['work-profitability', tenantId, workOrderId] })
  }

  async function propose() {
    if (busy || !validProposal) return
    const payload = {
      tenantId,
      workOrderId,
      description: description.trim(),
      quantity: numericQuantity,
      unit: unit.trim(),
      unitPriceCents: priceCents,
      unitCostCents: costCents,
      vatRate: numericVat,
    }
    const key = `propose:${JSON.stringify(payload)}`
    let operationId = operationIds.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operationIds.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await proposeWorkExtra({ ...payload, operationId })
      operationIds.current.delete(key)
      setDescription('')
      setUnitPrice('')
      setUnitCost('')
      setPage(0)
      await refresh()
      toast.success('Extra propuesto; pendiente de aprobación')
    } catch (error) {
      toast.error('No se pudo proponer el extra', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function decide(decision: 'approved' | 'rejected') {
    if (busy || !decisionExtraId || !customerName.trim() || !evidence.trim()) return
    const payload = {
      tenantId,
      extraId: decisionExtraId,
      decision,
      customerName: customerName.trim(),
      evidenceDescription: evidence.trim(),
    }
    const key = `decide:${JSON.stringify(payload)}`
    let operationId = operationIds.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operationIds.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await decideWorkExtra({ ...payload, operationId })
      operationIds.current.delete(key)
      setDecisionExtraId(null)
      setCustomerName('')
      setEvidence('')
      await refresh()
      toast.success(decision === 'approved' ? 'Aprobación registrada' : 'Rechazo registrado')
    } catch (error) {
      toast.error('No se pudo registrar la decisión', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function prepareInvoiceDraft(extraId: string) {
    if (busy) return
    setBusy(true)
    try {
      await createWorkExtraInvoiceDraft({ tenantId, extraId })
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ['invoice-work-extra-drafts', tenantId] }),
      ])
      toast.success('Borrador del extra preparado. Revísalo en Facturas.')
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
        <CardTitle>Extras del trabajo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-muted-foreground text-sm">
          El precio y el coste quedan fijados al proponer cada extra. Una persona de oficina
          registra la decisión y describe la evidencia recibida; este registro no es una firma del
          cliente.
        </p>
        {canPropose ? (
          <section aria-label="Proponer extra" className="space-y-3 border-b pb-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Descripción del extra"
                value={description}
                onChange={setDescription}
                placeholder="Ejemplo: sustituir bomba"
                maxLength={500}
                className="sm:col-span-2"
              />
              <TextField label="Cantidad" value={quantity} onChange={setQuantity} placeholder="1" />
              <TextField
                label="Unidad"
                value={unit}
                onChange={setUnit}
                placeholder="ud"
                maxLength={30}
              />
              <TextField
                label="Precio por unidad sin IVA (€)"
                value={unitPrice}
                onChange={setUnitPrice}
                placeholder="0,00"
              />
              <TextField
                label="Coste previsto por unidad sin IVA (€)"
                value={unitCost}
                onChange={setUnitCost}
                placeholder="0,00"
              />
              <TextField label="IVA (%)" value={vatRate} onChange={setVatRate} placeholder="21" />
            </div>
            <Button isDisabled={busy || !validProposal} onPress={() => void propose()}>
              {busy ? 'Guardando…' : 'Proponer extra'}
            </Button>
          </section>
        ) : null}
        {query.isError ? (
          <p role="alert" className="text-destructive text-sm">
            No se pudieron cargar los extras: {query.error.message}
            <Button variant="outline" className="ml-2" onPress={() => void query.refetch()}>
              Reintentar
            </Button>
          </p>
        ) : query.isPending ? (
          <output>Cargando extras…</output>
        ) : query.data.extras.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aún no hay extras propuestos.</p>
        ) : (
          <ol className="divide-y">
            {query.data.extras.map((extra) => {
              const approval = query.data.decisions.find((item) => item.extra_id === extra.id)
              const invoice = query.data.invoices.find((item) => item.work_extra_id === extra.id)
              const draft = query.data.drafts.find(
                (item) => item.work_extra_id === extra.id && item.status === 'draft',
              )
              return (
                <li key={extra.id} className="space-y-2 py-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{extra.description}</p>
                      <p className="text-muted-foreground">
                        {extra.quantity} {extra.unit} · IVA {extra.vat_rate}% ·{' '}
                        {statusLabels[extra.status]}
                      </p>
                    </div>
                    <p className="text-right tabular-nums">
                      Precio: {formatEuros(extra.price_cents)}
                      <br />
                      Coste previsto: {formatEuros(extra.planned_cost_cents)}
                    </p>
                  </div>
                  {approval ? (
                    <p className="bg-muted rounded-lg p-3">
                      {approval.decision === 'approved' ? 'Aprobación' : 'Rechazo'} registrado por
                      oficina a nombre de {approval.customer_name} el{' '}
                      {new Date(approval.decided_at).toLocaleString('es-ES')}. Evidencia indicada:{' '}
                      {approval.evidence_description}
                    </p>
                  ) : null}
                  {invoice ? (
                    <p>
                      Facturado en{' '}
                      <Link
                        to="/facturas/$invoiceId"
                        params={{ invoiceId: invoice.id }}
                        className="text-primary font-medium underline"
                      >
                        {invoice.number}
                      </Link>
                    </p>
                  ) : null}
                  {extra.status === 'approved' && !invoice ? (
                    draft ? (
                      <Link to="/facturas" className="text-primary font-medium underline">
                        Borrador pendiente de revisar en Facturas
                      </Link>
                    ) : (
                      <Button
                        variant="outline"
                        isDisabled={busy}
                        onPress={() => void prepareInvoiceDraft(extra.id)}
                      >
                        {busy ? 'Preparando…' : 'Preparar borrador'}
                      </Button>
                    )
                  ) : null}
                  {extra.status === 'pending' ? (
                    decisionExtraId === extra.id ? (
                      <div className="space-y-3 rounded-lg border p-3">
                        <TextField
                          label="Nombre de quien comunica la decisión"
                          value={customerName}
                          onChange={setCustomerName}
                          placeholder="Nombre y apellidos"
                          maxLength={200}
                        />
                        <TextField
                          label="Evidencia y medio recibido"
                          value={evidence}
                          onChange={setEvidence}
                          placeholder="Ejemplo: correo recibido el 22/10"
                          maxLength={2000}
                          helper="Ejemplo: correo recibido el 22/10; conserva el original fuera de este campo."
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            isDisabled={busy || !customerName.trim() || !evidence.trim()}
                            onPress={() => void decide('approved')}
                          >
                            Registrar aprobación
                          </Button>
                          <Button
                            variant="outline"
                            isDisabled={busy || !customerName.trim() || !evidence.trim()}
                            onPress={() => void decide('rejected')}
                          >
                            Registrar rechazo
                          </Button>
                          <Button
                            variant="ghost"
                            isDisabled={busy}
                            onPress={() => setDecisionExtraId(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        isDisabled={busy}
                        onPress={() => {
                          setDecisionExtraId(extra.id)
                          setCustomerName('')
                          setEvidence('')
                        }}
                      >
                        Registrar decisión
                      </Button>
                    )
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}
        {query.data && query.data.count > query.data.pageSize ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>
              Página {page + 1} de {Math.ceil(query.data.count / query.data.pageSize)}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" isDisabled={page === 0} onPress={() => setPage(page - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                isDisabled={(page + 1) * query.data.pageSize >= query.data.count}
                onPress={() => setPage(page + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
