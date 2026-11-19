import { Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { useState } from 'react'

import { can, useSession } from '@/features/auth'
import { ClientFormDialog } from '@/features/clients/ui/client-form-dialog'
import { formLimits } from '@/shared/domain/form-limits'
import type { Client, Estimate } from '@/shared/domain/types'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField } from '@/shared/ui/form'

import { useEstimateDraft, usePatchEstimate } from './estimate-draft-context'

export function EstimateDraftDetails({
  estimate,
  clients,
}: {
  estimate: Estimate
  clients: Client[]
}) {
  const creation = useEstimateDraft()
  const patchEstimate = usePatchEstimate()
  const session = useSession()
  const [titleEdit, setTitleEdit] = useState<string | null>(null)
  const [creatingClient, setCreatingClient] = useState(false)
  const titleDraft = titleEdit ?? estimate.title

  return (
    <>
      <Card className="@container">
        <CardHeader>
          <CardTitle>Datos generales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 @min-[44rem]:grid-cols-4">
          <TextField
            label="Título del servicio o acuerdo"
            minLength={1}
            maxLength={formLimits.estimateTitle}
            required
            showCount
            className="sm:col-span-2"
            placeholder="Ej. Limpieza de oficinas"
            icon={fieldIcons.file}
            value={titleDraft}
            onChange={(title) =>
              creation ? patchEstimate(estimate.id, { title }) : setTitleEdit(title)
            }
            onBlur={() => {
              if (creation) return
              const title = titleDraft.trim()
              setTitleEdit(null)
              if (title.length >= 1 && title.length <= formLimits.estimateTitle) {
                patchEstimate(estimate.id, { title })
              }
            }}
          />
          <div className="flex min-w-0 flex-col gap-1.5 @min-[44rem]:col-span-2">
            <SelectField
              label="Cliente"
              value={estimate.clientId}
              options={[
                { value: '', label: 'Sin cliente' },
                ...clients
                  .filter((client) => !client.archivedAt || client.id === estimate.clientId)
                  .map(({ id, name }) => ({ value: id, label: name })),
              ]}
              onChange={(clientId) => patchEstimate(estimate.id, { clientId })}
            />
            {can(session?.role, 'clients:write') ? (
              <button
                type="button"
                className="text-primary self-start text-xs font-medium hover:underline"
                onClick={() => setCreatingClient(true)}
              >
                {clients.length === 0 ? '+ Crear tu primer cliente' : '+ Crear cliente nuevo'}
              </button>
            ) : null}
          </div>
          <TextField
            label="Válido hasta"
            type="date"
            placeholder="dd/mm/aaaa"
            helper="Pasada esta fecha el presupuesto caduca."
            value={estimate.validUntil}
            onChange={(validUntil) => patchEstimate(estimate.id, { validUntil })}
          />
          {!estimate.automaticContract ? (
            <SelectField
              label="Destino tras la aceptación"
              className={
                estimate.conversionDestination === 'contract' ? '' : '@min-[44rem]:col-span-2'
              }
              value={estimate.conversionDestination ?? 'work'}
              options={[
                { value: 'work', label: 'Trabajo' },
                { value: 'contract', label: 'Contrato recurrente' },
              ]}
              onChange={(conversionDestination) => {
                if (conversionDestination === 'work' || conversionDestination === 'contract') {
                  patchEstimate(estimate.id, { conversionDestination })
                }
              }}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              Al aceptarse se crea automáticamente el contrato en borrador, con cada partida como
              trabajo pendiente de configurar.
            </p>
          )}
        </CardContent>
      </Card>
      <ClientFormDialog
        open={creatingClient}
        onClose={() => setCreatingClient(false)}
        onSaved={(clientId) => patchEstimate(estimate.id, { clientId })}
      />
    </>
  )
}
