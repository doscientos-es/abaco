import { Button, toast } from '@doscientos/ui'
import { Link, linkOptions } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { namedDocumentOptions, type DocumentLibrary } from '@/shared/domain/document-library'
import { formatEuros } from '@/shared/domain/money'
import { refreshStore } from '@/shared/store/store'
import { SelectField } from '@/shared/ui/form'

import { issueInvoiceDraft, updateInvoiceDraft } from '../application/invoice-draft-actions'
import type { InvoiceDraft } from '../domain/invoice-draft'

const origins = {
  milestone: {
    title: 'Borrador de hito',
    label: 'presupuesto',
    description: 'hito aceptado',
    link: (estimateId: string) =>
      linkOptions({ to: '/presupuestos/$estimateId', params: { estimateId } }),
  },
  work_extra: {
    title: 'Borrador de extra aprobado',
    label: 'trabajo',
    description: 'extra aprobado',
    link: (workOrderId: string) =>
      linkOptions({ to: '/trabajos/$workOrderId', params: { workOrderId } }),
  },
  contract_period: {
    title: 'Borrador de periodo contractual',
    label: 'contrato',
    description: 'periodo contractual valorado',
    link: (contractId: string) =>
      linkOptions({ to: '/contratos/$contractId', params: { contractId } }),
  },
}

type DraftItemProps = {
  draft: InvoiceDraft
  refresh: () => Promise<void>
  library: DocumentLibrary | undefined
}

export function InvoiceDraftItem(props: DraftItemProps) {
  const [templateId, setTemplateId] = useState('')
  return (
    <DraftItemFields
      key={props.draft.revision}
      {...props}
      templateId={templateId}
      onTemplateChange={setTemplateId}
    />
  )
}

function DraftItemFields({
  draft,
  refresh,
  library,
  templateId,
  onTemplateChange,
}: DraftItemProps & {
  templateId: string
  onTemplateChange: (value: string) => void
}) {
  const [concept, setConcept] = useState(draft.concept)
  const [dueDate, setDueDate] = useState(draft.dueDate)
  const [busy, setBusy] = useState(false)
  const issueOperationId = useRef<string | null>(null)
  const changed = concept.trim() !== draft.concept || dueDate !== draft.dueDate
  const origin = origins[draft.source]
  const position = {
    source: draft.source,
    tenantId: draft.tenantId,
    draftId: draft.id,
    revision: draft.revision,
  }
  const defaultTemplate = library?.invoices.find(({ id }) => id === library.defaultInvoiceId)
  const availableTemplates = library?.invoices.filter(({ id }) => id !== defaultTemplate?.id) ?? []
  const chosenTemplate = availableTemplates.find(({ id }) => id === templateId)

  async function save() {
    if (!changed || busy || !dueDate) return
    setBusy(true)
    try {
      await updateInvoiceDraft({ ...position, concept, dueDate })
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
    if (changed || busy || !dueDate) return
    issueOperationId.current ??= crypto.randomUUID()
    setBusy(true)
    try {
      await issueInvoiceDraft({
        ...position,
        operationId: issueOperationId.current,
        templateId: chosenTemplate?.id ?? null,
      })
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
          <p className="font-medium">{origin.title}</p>
          <Link
            {...origin.link(draft.originId)}
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            Ver {origin.label} de origen
          </Link>
        </div>
        <p className="text-lg font-semibold tabular-nums">{formatEuros(draft.totalCents)}</p>
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
      {availableTemplates.length ? (
        <SelectField
          label="Plantilla de factura"
          value={chosenTemplate?.id ?? ''}
          options={[
            {
              value: '',
              label: defaultTemplate
                ? `${defaultTemplate.name} · Por defecto`
                : 'Diseño por defecto de la empresa',
            },
            ...namedDocumentOptions(availableTemplates),
          ]}
          onChange={onTemplateChange}
          isDisabled={busy}
        />
      ) : defaultTemplate ? (
        <p className="text-muted-foreground text-xs">
          Plantilla por defecto: {defaultTemplate.name}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        El importe y el IVA proceden del {origin.description}. La numeración se asignará al emitir.
      </p>
      {!dueDate ? (
        <p className="text-muted-foreground text-xs">Indica el vencimiento antes de emitir.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          isDisabled={!changed || busy || !dueDate}
          onPress={() => void save()}
        >
          Guardar borrador
        </Button>
        <Button size="sm" isDisabled={changed || busy || !dueDate} onPress={() => void issue()}>
          Emitir factura
        </Button>
      </div>
    </li>
  )
}
