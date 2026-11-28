import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useActionLock } from '@/shared/lib/use-action-lock'
import { TextareaField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  emptyStaffArrival,
  loadStaffArrival,
  normalizeStaffArrival,
  saveStaffArrival,
  type StaffArrivalDraft,
} from '../application/staff-arrival-actions'

type Props = {
  tenantId: string
  userId: string
  locationId: string
  locationName: string
  onClose: () => void
}

export function StaffArrivalDialog(props: Props) {
  const { tenantId, userId, locationId, locationName, onClose } = props
  const queryKey = ['staff-arrival-office', tenantId, userId, locationId]
  const record = useQuery({
    queryKey,
    queryFn: () => loadStaffArrival(tenantId, locationId),
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  if (record.isSuccess && record.isFetchedAfterMount && !record.isFetching) {
    const { updated_at, ...initial } = record.data ?? { ...emptyStaffArrival, updated_at: null }
    return (
      <StaffArrivalForm
        {...props}
        key={updated_at ?? 'empty'}
        initial={initial}
        expectedUpdatedAt={updated_at}
      />
    )
  }
  return (
    <FormDialog
      open
      title={`Llegada para técnicos · ${locationName}`}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      submitLabel="Guardar ficha"
      submitDisabled
      onSubmit={() => undefined}
    >
      {record.isError || record.isPaused ? (
        <div className="space-y-2 sm:col-span-2">
          <p role="alert" className="text-destructive text-sm">
            No se pudo consultar la ficha de llegada.
          </p>
          <Button variant="outline" onPress={() => void record.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <output className="text-muted-foreground text-sm sm:col-span-2">
          Cargando ficha de llegada…
        </output>
      )}
    </FormDialog>
  )
}

function StaffArrivalForm({
  tenantId,
  locationId,
  locationName,
  userId,
  onClose,
  initial,
  expectedUpdatedAt,
}: Props & { initial: StaffArrivalDraft; expectedUpdatedAt: string | null }) {
  const [draft, setDraft] = useState(initial)
  const [acknowledged, setAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const queryClient = useQueryClient()
  const lock = useActionLock()
  const { cleaned, error } = normalizeStaffArrival(draft)
  const dirty = Object.keys(draft).some(
    (key) => draft[key as keyof StaffArrivalDraft] !== initial[key as keyof StaffArrivalDraft],
  )
  const requiresReview =
    (cleaned.share_directions &&
      (!initial.share_directions ||
        cleaned.instructions !== initial.instructions ||
        cleaned.parking !== initial.parking)) ||
    (cleaned.share_contact &&
      (!initial.share_contact ||
        cleaned.contact_label !== initial.contact_label ||
        cleaned.contact_phone !== initial.contact_phone))

  function change<K extends keyof StaffArrivalDraft>(key: K, value: StaffArrivalDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setAcknowledged(false)
    setSaveError('')
  }

  async function submit() {
    if (!dirty || error || (requiresReview && !acknowledged) || !lock.acquire()) return
    setSaving(true)
    try {
      await saveStaffArrival(tenantId, locationId, cleaned, expectedUpdatedAt)
      onClose()
      void queryClient.invalidateQueries({
        queryKey: ['staff-arrival-office', tenantId, userId, locationId],
      })
      void queryClient.invalidateQueries({ queryKey: ['assigned-visit-arrivals', tenantId] })
      toast.success('Ficha de llegada guardada')
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'No se pudo guardar la ficha.')
    } finally {
      lock.release()
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open
      title={`Llegada para técnicos · ${locationName}`}
      description="Esta ficha es independiente de los datos internos del centro. Solo la verán los técnicos asignados a una visita abierta si activas las opciones de compartir."
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      isDirty={dirty}
      isSubmitting={saving}
      submitLabel="Guardar ficha"
      submitDisabled={!dirty || Boolean(error) || (requiresReview && !acknowledged)}
      onSubmit={() => void submit()}
    >
      <p className="border-warning rounded-md border p-2.5 text-sm sm:col-span-2">
        No incluyas llaves, PIN, contraseñas, códigos de alarma ni teléfonos personales. Para un
        contacto, usa solo un número de trabajo autorizado.
      </p>
      <TextareaField
        label="Indicaciones de entrada"
        value={draft.instructions}
        onChange={(value) => change('instructions', value)}
        placeholder="Por ejemplo: entra por recepción y pregunta por mantenimiento."
        maxLength={600}
        className="sm:col-span-2"
      />
      <TextareaField
        label="Aparcamiento"
        value={draft.parking}
        onChange={(value) => change('parking', value)}
        placeholder="Por ejemplo: plazas de visita junto a la entrada norte."
        maxLength={400}
        className="sm:col-span-2"
      />
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={draft.share_directions}
          onChange={(event) => change('share_directions', event.target.checked)}
        />
        Compartir entrada y aparcamiento
      </label>
      <TextField
        label="Nombre o función del contacto"
        value={draft.contact_label}
        onChange={(value) => change('contact_label', value)}
        placeholder="Por ejemplo: recepción"
        maxLength={120}
      />
      <TextField
        label="Teléfono de trabajo"
        value={draft.contact_phone}
        onChange={(value) => change('contact_phone', value)}
        placeholder="+34 600 000 000"
        type="tel"
        maxLength={32}
      />
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={draft.share_contact}
          onChange={(event) => change('share_contact', event.target.checked)}
        />
        Compartir este teléfono operativo
      </label>
      {requiresReview ? (
        <label className="border-border flex min-h-11 items-center gap-2 rounded-md border p-2.5 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          He revisado los datos compartidos y no incluyen claves ni información privada.
        </label>
      ) : null}
      {error || saveError ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {saveError || error}
        </p>
      ) : null}
    </FormDialog>
  )
}
