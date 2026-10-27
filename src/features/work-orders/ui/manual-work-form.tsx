import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import type { Client } from '@/shared/domain/types'
import { SelectField, TextField, TextareaField } from '@/shared/ui/form'

import {
  createManualWorkOrder,
  loadWorkTargetOptions,
  type WorkOrder,
} from '../application/work-order-actions'

const kindOptions: Array<{ value: WorkOrder['kind']; label: string }> = [
  { value: 'installation', label: 'Instalación' },
  { value: 'repair', label: 'Reparación' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'other', label: 'Otro' },
]

export function ManualWorkForm({ tenantId, clients }: { tenantId: string; clients: Client[] }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [clientId, setClientId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<WorkOrder['kind']>('repair')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const operationId = useRef(crypto.randomUUID())
  const targets = useQuery({
    queryKey: ['work-target-options', tenantId, clientId],
    queryFn: () => loadWorkTargetOptions(tenantId, clientId),
    enabled: Boolean(clientId),
  })
  const locations = targets.data?.locations ?? []
  const assets = (targets.data?.assets ?? []).filter((asset) => asset.location_id === locationId)

  function changed() {
    operationId.current = crypto.randomUUID()
  }

  async function createWork() {
    if (saving) return
    if (!clientId || !title.trim()) {
      toast.error('Elige un cliente y escribe el título del trabajo.')
      return
    }
    setSaving(true)
    try {
      const workOrderId = await createManualWorkOrder({
        tenantId,
        clientId,
        title,
        kind,
        locationId: locationId || null,
        assetId: assetId || null,
        description,
        operationId: operationId.current,
      })
      await queryClient.invalidateQueries({ queryKey: ['work-orders', tenantId] })
      toast.success('Trabajo creado')
      void navigate({ to: '/trabajos/$workOrderId', params: { workOrderId } })
    } catch (error) {
      toast.error('No se pudo crear el trabajo', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo trabajo</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Cliente"
          value={clientId}
          options={clients
            .filter((client) => !client.archivedAt)
            .map((client) => ({ value: client.id, label: client.name }))}
          onChange={(value) => {
            setClientId(value)
            setLocationId('')
            setAssetId('')
            changed()
          }}
          placeholder="Selecciona un cliente"
        />
        <SelectField
          label="Tipo de trabajo"
          value={kind}
          options={kindOptions}
          onChange={(value) => {
            setKind(value as WorkOrder['kind'])
            changed()
          }}
        />
        <TextField
          label="Título"
          value={title}
          onChange={(value) => {
            setTitle(value)
            changed()
          }}
          placeholder="Ejemplo: reparar depuradora"
          maxLength={200}
          className="sm:col-span-2"
        />
        {clientId && targets.isError ? (
          <p role="alert" className="text-destructive sm:col-span-2">
            No se pudieron cargar las ubicaciones: {targets.error.message}
          </p>
        ) : null}
        <SelectField
          label="Ubicación de servicio"
          value={locationId}
          options={[
            { value: '', label: 'Sin ubicación' },
            ...locations.map((place) => ({
              value: place.id,
              label: `${place.name} · ${place.address}`,
            })),
          ]}
          onChange={(value) => {
            setLocationId(value)
            setAssetId('')
            changed()
          }}
        />
        <SelectField
          label="Activo"
          value={assetId}
          options={[
            { value: '', label: 'Sin activo' },
            ...assets.map((asset) => ({
              value: asset.id,
              label: asset.name,
            })),
          ]}
          onChange={(value) => {
            setAssetId(value)
            changed()
          }}
        />
        <TextareaField
          label="Descripción inicial"
          value={description}
          onChange={(value) => {
            setDescription(value)
            changed()
          }}
          placeholder="Alcance o problema comunicado"
          maxLength={4000}
          className="sm:col-span-2"
        />
        <div className="sm:col-span-2">
          <Button
            isDisabled={saving || !clientId || !title.trim()}
            onPress={() => void createWork()}
          >
            {saving ? 'Creando…' : 'Crear trabajo'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
