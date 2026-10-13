import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
  PageHeaderActions,
  PageHeaderHeading,
  PageHeaderTitle,
} from '@doscientos/ui'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import {
  calculateTotals,
  milestoneAmounts,
  milestonePercentSum,
  paidForEstimate,
} from '@/shared/domain/estimate'
import { formatEuros } from '@/shared/domain/money'
import type { EstimateStatus } from '@/shared/domain/types'
import { openEmail } from '@/shared/lib/email'
import { openWhatsapp } from '@/shared/lib/whatsapp'
import { fieldIcons } from '@/shared/ui/field-icons'
import { useTenantData } from '@/shared/store/store'
import { FormField, SelectField, TextField, TextareaField } from '@/shared/ui/form'
import { PageNotFound } from '@/shared/ui/page-states'
import { StatusBadge, statusLabels } from '@/shared/ui/status-badge'
import { ClientFormDialog } from '@/features/clients/ui/client-form-dialog'

import {
  deleteEstimate,
  duplicateEstimate,
  patchEstimate,
} from '../application/estimate-actions'
import { EstimateDocument } from './estimate-document'
import { LinesEditor } from './lines-editor'
import { MilestonesEditor } from './milestones-editor'

export function EstimateEditorPage({ estimateId }: { estimateId: string }) {
  const { estimates, clients, catalog, tenant, ledger } = useTenantData()
  const navigate = useNavigate()
  const [preview, setPreview] = useState(false)
  const [creatingClient, setCreatingClient] = useState(false)
  const estimate = estimates.find((e) => e.id === estimateId)

  if (!estimate) {
    return (
      <PageNotFound
        title="Este presupuesto ya no existe"
        description="Puede que lo hayas borrado. Vuelve a la lista para ver los que tienes."
        backTo="/presupuestos"
        backLabel="Ver mis presupuestos"
      />
    )
  }

  const client = clients.find((c) => c.id === estimate.clientId)
  const totals = calculateTotals(estimate.lines, estimate.vatRate)
  const amounts = milestoneAmounts(estimate.milestones, totals.totalCents)
  const percentSum = milestonePercentSum(estimate.milestones)
  const paid = paidForEstimate(estimate.id, ledger)

  function buildMessage() {
    if (!estimate) return ''
    return [
      `Hola ${client?.name ?? ''},`,
      '',
      `Te enviamos el presupuesto ${estimate.number} para «${estimate.title}».`,
      `Total: ${formatEuros(totals.totalCents)} (IVA incluido). Válido hasta ${estimate.validUntil}.`,
      '',
      'Quedamos a tu disposición para cualquier duda.',
      tenant.name,
    ].join('\n')
  }

  function sendByEmail() {
    if (!estimate) return
    if (estimate.status === 'draft') patchEstimate(estimate.id, { status: 'sent' })
    openEmail(
      client?.email ?? '',
      `Presupuesto ${estimate.number} · ${tenant.name}`,
      buildMessage(),
    )
  }

  function sendByWhatsapp() {
    if (!estimate) return
    if (estimate.status === 'draft') patchEstimate(estimate.id, { status: 'sent' })
    openWhatsapp(client?.phone ?? '', buildMessage())
  }

  if (preview) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" onPress={() => setPreview(false)}>
            Volver a editar
          </Button>
          <Button onPress={() => window.print()}>Imprimir o guardar PDF</Button>
        </div>
        <EstimateDocument estimate={estimate} client={client} tenant={tenant} />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>
            {estimate.number} <StatusBadge status={estimate.status} />
          </PageHeaderTitle>
        </PageHeaderHeading>
        <PageHeaderActions>
          <Button onPress={sendByEmail}>Enviar por email</Button>
          <Button variant="outline" onPress={sendByWhatsapp}>
            Enviar por WhatsApp
          </Button>
          <Button variant="outline" onPress={() => setPreview(true)}>
            Vista del cliente
          </Button>
          <Button
            variant="outline"
            onPress={() => {
              const id = duplicateEstimate(estimate.id)
              if (id) void navigate({ to: '/presupuestos/$estimateId', params: { estimateId: id } })
            }}
          >
            Duplicar
          </Button>
          <Button
            variant="destructive"
            onPress={() => {
              deleteEstimate(estimate.id)
              void navigate({ to: '/presupuestos' })
            }}
          >
            Eliminar
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Datos generales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Título de la obra"
            className="sm:col-span-2"
            placeholder="Ej. Reforma de baño"
            icon={fieldIcons.file}
            value={estimate.title}
            onChange={(title) => patchEstimate(estimate.id, { title })}
          />
          <div className="flex flex-col gap-1.5">
            <SelectField
              label="Cliente"
              value={estimate.clientId}
              options={[
                { value: '', label: 'Sin cliente' },
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
              onChange={(clientId) => patchEstimate(estimate.id, { clientId })}
            />
            <button
              type="button"
              className="text-primary self-start text-xs font-medium hover:underline"
              onClick={() => setCreatingClient(true)}
            >
              {clients.length === 0 ? '+ Crear tu primer cliente' : '+ Crear cliente nuevo'}
            </button>
          </div>
          <SelectField
            label="Estado"
            value={estimate.status}
            options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
            onChange={(status) => patchEstimate(estimate.id, { status: status as EstimateStatus })}
          />
          <TextField
            label="Válido hasta"
            type="date"
            placeholder="dd/mm/aaaa"
            helper="Pasada esta fecha el presupuesto caduca."
            value={estimate.validUntil}
            onChange={(validUntil) => patchEstimate(estimate.id, { validUntil })}
          />
          <FormField label="IVA %">
            <Input
              type="number"
              min={0}
              placeholder="10"
              value={estimate.vatRate}
              onChange={(event) => patchEstimate(estimate.id, { vatRate: Number(event.target.value) || 0 })}
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Partidas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <LinesEditor estimate={estimate} catalog={catalog} />
          <dl className="ml-auto w-full max-w-xs space-y-1 tabular-nums">
            <Line label="Base imponible" value={totals.subtotalCents} />
            <Line label={`IVA ${estimate.vatRate}%`} value={totals.vatCents} />
            <div className="flex justify-between border-t pt-2 text-lg font-semibold">
              <dt>Total</dt>
              <dd>{formatEuros(totals.totalCents)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hitos de pago</CardTitle>
        </CardHeader>
        <CardContent>
          <MilestonesEditor
            estimate={estimate}
            amounts={amounts}
            percentSum={percentSum}
            paidCents={paid}
            totalCents={totals.totalCents}
            ledger={ledger}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Condiciones</CardTitle>
        </CardHeader>
        <CardContent>
          <TextareaField
            label="Condiciones"
            hideLabel
            placeholder="Forma de pago, plazos, garantía, qué incluye y qué no…"
            value={estimate.clauses}
            onChange={(clauses) => patchEstimate(estimate.id, { clauses })}
          />
        </CardContent>
      </Card>

      <ClientFormDialog
        open={creatingClient}
        onClose={() => setCreatingClient(false)}
        onSaved={(clientId) => patchEstimate(estimate.id, { clientId })}
      />

    </div>
  )
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{formatEuros(value)}</dd>
    </div>
  )
}
