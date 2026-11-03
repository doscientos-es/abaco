import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import type { Client } from '@/shared/domain/types'
import { SelectField, TextField, TextareaField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

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

export function ManualWorkForm({
  tenantId,
  clients,
  onClose,
}: {
  tenantId: string
  clients: Client[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [clientId, setClientId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<WorkOrder['kind']>('repair')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const operationId = useRef(crypto.randomUUID())
  const targets = useQuery({
    queryKey: ['work-target-options', tenantId, clientId],
    queryFn: () => loadWorkTargetOptions(tenantId, clientId),
    enabled: Boolean(clientId),
  })
  const locations = targets.data?.locations ?? []
  const assets = (targets.data?.assets ?? []).filter((asset) => asset.location_id === locationId)
  const activeClients = clients.filter((client) => !client.archivedAt)
  const dirty = Boolean(clientId || title || description || kind !== 'repair')

  function changed() {
    operationId.current = crypto.randomUUID()
  }

  async function createWork() {
    if (saving || !clientId || !title.trim()) return
    setSaving(true)
    setError('')
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
      onClose()
      void navigate({ to: '/trabajos/$workOrderId', params: { workOrderId } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Nuevo trabajo"
      description="Indica qué hay que hacer y para quién. Después podrás asignar equipo, fechas y tareas."
      submitLabel={saving ? 'Creando…' : 'Crear trabajo'}
      submitDisabled={!clientId || !title.trim()}
      isSubmitting={saving}
      isDirty={dirty}
      onSubmit={() => void createWork()}
    >
      {!activeClients.length ? (
        <div className="bg-muted/50 rounded-lg p-3 text-sm sm:col-span-2">
          <p>Necesitas un cliente activo para crear un trabajo.</p>
          <Link to="/clientes" className="text-primary font-medium underline">
            Ir a clientes
          </Link>
        </div>
      ) : null}
      <TextField
        label="Título del trabajo"
        value={title}
        onChange={(value) => {
          setTitle(value)
          changed()
        }}
        placeholder="Por ejemplo: revisión del equipo de climatización"
        helper="Obligatorio. Usa un nombre que puedas reconocer en el listado."
        maxLength={200}
        className="sm:col-span-2"
      />
      <SelectField
        label="Cliente"
        isDisabled={saving || !activeClients.length}
        value={clientId}
        options={activeClients.map((client) => ({ value: client.id, label: client.name }))}
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
        isDisabled={saving}
        value={kind}
        options={kindOptions}
        onChange={(value) => {
          setKind(value as WorkOrder['kind'])
          changed()
        }}
      />
      {clientId ? (
        <details className="border-border rounded-lg border p-3 sm:col-span-2">
          <summary className="cursor-pointer text-sm font-medium">
            Ubicación y activo · opcional
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {targets.isPending ? (
              <output className="text-muted-foreground text-sm sm:col-span-2">
                Cargando ubicaciones…
              </output>
            ) : null}
            {targets.isError ? (
              <div role="alert" className="space-y-2 text-sm sm:col-span-2">
                <p className="text-destructive">
                  No se pudieron cargar las ubicaciones. Puedes crear el trabajo sin ellas o volver
                  a intentarlo.
                </p>
                <Button
                  variant="outline"
                  isDisabled={saving}
                  onPress={() => void targets.refetch()}
                >
                  Reintentar ubicaciones
                </Button>
              </div>
            ) : null}
            <SelectField
              label="Ubicación de servicio"
              isDisabled={saving || !targets.isSuccess || !locations.length}
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
              isDisabled={saving || !targets.isSuccess || !assets.length}
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
            {targets.isSuccess && !locations.length ? (
              <p className="text-muted-foreground text-xs sm:col-span-2">
                Este cliente no tiene ubicaciones registradas. Puedes añadirlas más adelante en su
                ficha.
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
      <TextareaField
        label="Descripción · opcional"
        value={description}
        onChange={(value) => {
          setDescription(value)
          changed()
        }}
        placeholder="Alcance o problema comunicado"
        maxLength={4000}
        className="sm:col-span-2"
      />
      {error ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          No se pudo crear el trabajo: {error}
        </p>
      ) : null}
    </FormDialog>
  )
}
