import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { formatEuros } from '@/shared/domain/money'
import { refreshStore } from '@/shared/store/store'

import {
  issueContractPeriodInvoiceDraft,
  issueMilestoneInvoiceDraft,
  issueWorkExtraInvoiceDraft,
  listOpenContractPeriodInvoiceDrafts,
  listOpenInvoiceDrafts,
  listOpenWorkExtraInvoiceDrafts,
  updateContractPeriodInvoiceDraft,
  updateMilestoneInvoiceDraft,
  updateWorkExtraInvoiceDraft,
  type InvoiceContractPeriodDraft,
  type InvoiceMilestoneDraft,
  type InvoiceWorkExtraDraft,
} from '../application/invoice-draft-actions'

type DraftItemProps = (
  | { source: 'milestone'; draft: InvoiceMilestoneDraft }
  | { source: 'work_extra'; draft: InvoiceWorkExtraDraft }
  | { source: 'contract_period'; draft: InvoiceContractPeriodDraft }
) & { refresh: () => Promise<void> }

function DraftItem({ source, draft, refresh }: DraftItemProps) {
  const [concept, setConcept] = useState(draft.concept)
  const [dueDate, setDueDate] = useState(draft.due_date)
  const [busy, setBusy] = useState(false)
  const issueOperationId = useRef<string | null>(null)
  const changed = concept.trim() !== draft.concept || dueDate !== draft.due_date

  async function save() {
    if (!changed || busy) return
    setBusy(true)
    try {
      const input = {
        tenantId: draft.tenant_id,
        draftId: draft.id,
        revision: draft.revision,
        concept,
        dueDate,
      }
      if (source === 'milestone') await updateMilestoneInvoiceDraft(input)
      else if (source === 'work_extra') await updateWorkExtraInvoiceDraft(input)
      else await updateContractPeriodInvoiceDraft(input)
      await refresh()
      toast.success('Borrador guardado')
    } catch (error) {
      toast.error('No se pudo guardar el borrador', {
        description: error instanceof Error ? error.message : 'Recarga e inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function issue() {
    if (changed || busy) return
    issueOperationId.current ??= crypto.randomUUID()
    setBusy(true)
    try {
      const input = {
        tenantId: draft.tenant_id,
        draftId: draft.id,
        revision: draft.revision,
        operationId: issueOperationId.current,
      }
      if (source === 'milestone') await issueMilestoneInvoiceDraft(input)
      else if (source === 'work_extra') await issueWorkExtraInvoiceDraft(input)
      else await issueContractPeriodInvoiceDraft(input)
      await Promise.all([refresh(), refreshStore()])
      issueOperationId.current = null
      toast.success('Factura emitida con numeración del servidor')
    } catch (error) {
      toast.error('No se pudo emitir la factura', {
        description: error instanceof Error ? error.message : 'Recarga e inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="border-border bg-card space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {source === 'milestone'
              ? 'Borrador de hito'
              : source === 'work_extra'
                ? 'Borrador de extra aprobado'
                : 'Borrador de periodo contractual'}
          </p>
          {source === 'milestone' ? (
            <Link
              to="/presupuestos/$estimateId"
              params={{ estimateId: draft.estimate_id }}
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Ver presupuesto de origen
            </Link>
          ) : source === 'work_extra' ? (
            <Link
              to="/trabajos/$workOrderId"
              params={{ workOrderId: draft.work_order_id }}
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Ver trabajo de origen
            </Link>
          ) : (
            <Link
              to="/contratos/$contractId"
              params={{ contractId: draft.contract_id }}
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Ver contrato de origen
            </Link>
          )}
        </div>
        <p className="text-lg font-semibold tabular-nums">{formatEuros(draft.total_cents)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <label className="text-sm">
          Concepto
          <input
            value={concept}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setConcept(event.target.value)}
            className="border-input bg-background mt-1 block w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Vencimiento
          <input
            type="date"
            value={dueDate}
            disabled={busy}
            onChange={(event) => setDueDate(event.target.value)}
            className="border-input bg-background mt-1 block w-full rounded-lg border px-3 py-2"
          />
        </label>
      </div>
      <p className="text-muted-foreground text-xs">
        El importe y el IVA proceden del{' '}
        {source === 'milestone'
          ? 'hito aceptado'
          : source === 'work_extra'
            ? 'extra aprobado'
            : 'periodo contractual valorado'}
        . La numeración se asignará al emitir.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          isDisabled={!changed || busy}
          onPress={() => void save()}
        >
          Guardar borrador
        </Button>
        <Button size="sm" isDisabled={changed || busy} onPress={() => void issue()}>
          Emitir factura
        </Button>
      </div>
    </li>
  )
}

export function InvoiceDrafts({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const queryKey = ['invoice-milestone-drafts', tenantId, page]
  const drafts = useQuery({ queryKey, queryFn: () => listOpenInvoiceDrafts(tenantId, page) })
  const [extraPage, setExtraPage] = useState(0)
  const extraDrafts = useQuery({
    queryKey: ['invoice-work-extra-drafts', tenantId, extraPage],
    queryFn: () => listOpenWorkExtraInvoiceDrafts(tenantId, extraPage),
  })
  const [contractPage, setContractPage] = useState(0)
  const contractDrafts = useQuery({
    queryKey: ['invoice-contract-period-drafts', tenantId, contractPage],
    queryFn: () => listOpenContractPeriodInvoiceDrafts(tenantId, contractPage),
  })

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['invoice-milestone-drafts', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['invoice-work-extra-drafts', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['invoice-contract-period-drafts', tenantId] }),
    ])
  }

  return (
    <section className="space-y-3" aria-label="Borradores de factura">
      <div>
        <h2 className="text-lg font-semibold">Borradores de factura</h2>
        <p className="text-muted-foreground text-sm">
          Revisa el concepto y el vencimiento antes de emitir. El borrador no tiene número de
          factura.
        </p>
      </div>
      {drafts.isPending || extraDrafts.isPending || contractDrafts.isPending ? (
        <p className="text-sm">Cargando borradores…</p>
      ) : null}
      {drafts.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar los borradores.
        </p>
      ) : null}
      {extraDrafts.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar los borradores de extras.
        </p>
      ) : null}
      {contractDrafts.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar los borradores de contratos.
        </p>
      ) : null}
      {drafts.data?.items.length ? (
        <ul className="space-y-3">
          {drafts.data.items.map((draft) => (
            <DraftItem
              key={`${draft.id}:${draft.revision}`}
              source="milestone"
              draft={draft}
              refresh={refresh}
            />
          ))}
        </ul>
      ) : drafts.isSuccess &&
        extraDrafts.isSuccess &&
        contractDrafts.isSuccess &&
        !extraDrafts.data.items.length &&
        !contractDrafts.data.items.length ? (
        <p className="text-muted-foreground text-sm">No hay borradores pendientes.</p>
      ) : null}
      {extraDrafts.data?.items.length ? (
        <ul className="space-y-3">
          {extraDrafts.data.items.map((draft) => (
            <DraftItem
              key={`${draft.id}:${draft.revision}`}
              source="work_extra"
              draft={draft}
              refresh={refresh}
            />
          ))}
        </ul>
      ) : null}
      {contractDrafts.data?.items.length ? (
        <ul className="space-y-3">
          {contractDrafts.data.items.map((draft) => (
            <DraftItem
              key={`${draft.id}:${draft.revision}`}
              source="contract_period"
              draft={draft}
              refresh={refresh}
            />
          ))}
        </ul>
      ) : null}
      {page > 0 || drafts.data?.hasMore ? (
        <div className="flex items-center gap-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            isDisabled={page === 0}
            onPress={() => setPage((value) => value - 1)}
          >
            Anterior
          </Button>
          <span>Página {page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={!drafts.data?.hasMore}
            onPress={() => setPage((value) => value + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
      {extraPage > 0 || extraDrafts.data?.hasMore ? (
        <div className="flex items-center gap-2 text-sm">
          <span>Extras</span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={extraPage === 0}
            onPress={() => setExtraPage((value) => value - 1)}
          >
            Anterior
          </Button>
          <span>Página {extraPage + 1}</span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={!extraDrafts.data?.hasMore}
            onPress={() => setExtraPage((value) => value + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
      {contractPage > 0 || contractDrafts.data?.hasMore ? (
        <div className="flex items-center gap-2 text-sm">
          <span>Contratos</span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={contractPage === 0}
            onPress={() => setContractPage((value) => value - 1)}
          >
            Anterior
          </Button>
          <span>Página {contractPage + 1}</span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={!contractDrafts.data?.hasMore}
            onPress={() => setContractPage((value) => value + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </section>
  )
}
