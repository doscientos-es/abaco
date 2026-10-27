import { Button, Input, toast } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { useSession } from '@/features/auth'
import { createMilestoneInvoiceDraft } from '@/features/invoices/application/invoice-draft-actions'
import type { MilestoneAmount } from '@/shared/domain/estimate'
import { formLimits } from '@/shared/domain/form-limits'
import { formatEuros } from '@/shared/domain/money'
import type { Estimate, LedgerEntry, Milestone } from '@/shared/domain/types'
import { newId, useTenantData } from '@/shared/store/store'

import { patchEstimate, registerMilestonePayment } from '../application/estimate-actions'

type Props = {
  estimate: Estimate
  amounts: MilestoneAmount[]
  percentSum: number
  paidCents: number
  totalCents: number
  ledger: LedgerEntry[]
  readOnly?: boolean
}

export function MilestonesEditor({
  estimate,
  amounts,
  percentSum,
  paidCents,
  totalCents,
  ledger,
  readOnly = false,
}: Props) {
  const session = useSession()
  const { invoices } = useTenantData()
  const queryClient = useQueryClient()
  const [creatingDraftId, setCreatingDraftId] = useState<string | null>(null)

  async function prepareInvoiceDraft(milestoneId: string) {
    if (creatingDraftId || estimate.status !== 'accepted') return
    setCreatingDraftId(milestoneId)
    try {
      await createMilestoneInvoiceDraft({
        tenantId: estimate.tenantId,
        estimateId: estimate.id,
        milestoneId,
      })
      await queryClient.invalidateQueries({
        queryKey: ['invoice-milestone-drafts', estimate.tenantId],
      })
      toast.success('Borrador preparado. Revísalo en Facturas antes de emitirlo.')
    } catch (error) {
      toast.error('No se pudo preparar el borrador', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setCreatingDraftId(null)
    }
  }

  function setMilestones(milestones: Milestone[]) {
    if (readOnly) return
    if (
      milestones.some(
        (milestone) =>
          milestone.label.trim().length < 1 ||
          milestone.label.length > formLimits.milestoneLabel ||
          (milestone.description?.length ?? 0) > formLimits.milestoneDescription ||
          !Number.isFinite(milestone.percent) ||
          milestone.percent < 0 ||
          milestone.percent > 100,
      )
    )
      return
    patchEstimate(estimate.id, { milestones })
  }

  function update(id: string, patch: Partial<Milestone>) {
    setMilestones(estimate.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  function add() {
    const remaining = Math.max(0, 100 - percentSum)
    setMilestones([
      ...estimate.milestones,
      {
        id: newId(),
        label: `Hito ${estimate.milestones.length + 1}`,
        description: '',
        percent: remaining,
      },
    ])
  }

  function distributeEvenly() {
    const count = estimate.milestones.length
    if (count === 0) return
    const base = Math.floor((100 / count) * 100) / 100
    setMilestones(
      estimate.milestones.map((m, index) => ({
        ...m,
        percent: index === count - 1 ? Math.round((100 - base * (count - 1)) * 100) / 100 : base,
      })),
    )
  }

  const balanced = Math.abs(percentSum - 100) < 0.001

  return (
    <div className="space-y-3">
      {amounts.length > 0 ? (
        <div className="space-y-3">
          {amounts.map((m) => {
            const registered = ledger.some(
              (l) => l.estimateId === estimate.id && l.milestoneId === m.id,
            )
            const invoice = invoices.find(
              (i) => i.estimateId === estimate.id && i.milestoneId === m.id,
            )
            const invoiced = invoice !== undefined
            return (
              <div key={m.id} className="border-border bg-card overflow-hidden rounded-lg border">
                <div className="grid gap-3 p-4 sm:grid-cols-[1fr_6rem_9rem]">
                  <div className="space-y-2">
                    {readOnly ? (
                      <p className="font-medium">{m.label}</p>
                    ) : (
                      <Input
                        aria-label="Concepto del hito"
                        maxLength={formLimits.milestoneLabel}
                        placeholder="Ej. Señal a la aceptación"
                        className="font-medium"
                        value={m.label}
                        onChange={(event) => update(m.id, { label: event.target.value })}
                      />
                    )}
                    {readOnly ? (
                      m.description ? (
                        <p className="text-muted-foreground text-sm">{m.description}</p>
                      ) : null
                    ) : (
                      <Input
                        aria-label="Descripción del hito"
                        maxLength={formLimits.milestoneDescription}
                        placeholder="Descripción opcional (qué se entrega o cuándo se cobra)"
                        value={m.description ?? ''}
                        onChange={(event) => update(m.id, { description: event.target.value })}
                      />
                    )}
                  </div>
                  <div className="text-muted-foreground flex flex-col gap-1 text-xs">
                    Porcentaje
                    {readOnly ? (
                      <span className="text-foreground text-sm tabular-nums">{m.percent}%</span>
                    ) : (
                      <Input
                        aria-label="Porcentaje"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step="0.01"
                        className="text-right tabular-nums"
                        value={m.percent}
                        onChange={(event) =>
                          update(m.id, {
                            percent:
                              Math.round(
                                Math.min(100, Math.max(0, Number(event.target.value) || 0)) * 100,
                              ) / 100,
                          })
                        }
                      />
                    )}
                  </div>
                  <div className="text-muted-foreground flex flex-col gap-1 text-xs sm:items-end">
                    Importe con IVA
                    <span className="text-foreground text-lg font-semibold tabular-nums">
                      {formatEuros(m.amountCents)}
                    </span>
                  </div>
                </div>
                <div className="border-border bg-surface-subtle flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
                  <p className="text-muted-foreground text-xs">
                    {registered
                      ? 'Cobrado'
                      : invoiced
                        ? 'Facturado, pendiente de cobro'
                        : 'Sin facturar'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {invoice ? (
                      <Link
                        to="/facturas"
                        search={{ q: invoice.number }}
                        className="border-border hover:bg-accent inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium"
                      >
                        Ver y enviar {invoice.number}
                      </Link>
                    ) : session?.role === 'owner' || session?.role === 'admin' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        isDisabled={
                          m.amountCents <= 0 ||
                          estimate.status !== 'accepted' ||
                          Boolean(creatingDraftId)
                        }
                        onPress={() => void prepareInvoiceDraft(m.id)}
                      >
                        {creatingDraftId === m.id ? 'Preparando…' : 'Preparar borrador'}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      isDisabled={registered || m.amountCents <= 0}
                      onPress={() => registerMilestonePayment(estimate, m, m.amountCents)}
                    >
                      {registered ? 'Cobrado' : 'Registrar cobro'}
                    </Button>
                    {!readOnly ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        isDisabled={registered}
                        onPress={() =>
                          setMilestones(estimate.milestones.filter((x) => x.id !== m.id))
                        }
                      >
                        Quitar
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Aún no hay hitos de pago. Añade el primero.</p>
      )}

      <div className="border-border bg-surface-subtle flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className={balanced ? 'text-muted-foreground text-xs' : 'text-destructive text-xs'}>
          Suma de hitos: {percentSum}% {balanced ? '' : '(debe sumar 100%)'} · Cobrado:{' '}
          {formatEuros(paidCents)} de {formatEuros(totalCents)}
        </p>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              isDisabled={amounts.length === 0}
              onPress={distributeEvenly}
            >
              Repartir a partes iguales
            </Button>
            <Button size="sm" variant="outline" onPress={add}>
              Añadir hito
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
