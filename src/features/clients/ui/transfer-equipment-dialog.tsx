import { toast } from '@doscientos/ui'
import { useState } from 'react'

import { SelectField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import { transferEquipment, type ClientPassport } from '../application/client-passport-actions'

export function TransferEquipmentDialog({
  tenantId,
  equipment,
  targets,
  onClose,
  onSaved,
}: {
  tenantId: string
  equipment: ClientPassport['equipment'][number]
  targets: { value: string; label: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [targetId, setTargetId] = useState(targets[0]?.value ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!targetId || saving) return
    setSaving(true)
    try {
      await transferEquipment(tenantId, equipment, targetId)
      toast.success('Equipo trasladado', {
        description: 'El origen y el destino conservan el movimiento en su historial.',
      })
      onSaved()
    } catch (error) {
      toast.error('No se pudo trasladar el equipo', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
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
      title={`Trasladar ${equipment.kind}`}
      description="El equipo cambiará de activo dentro de este cliente. El historial del origen se conserva."
      submitLabel={saving ? 'Trasladando…' : 'Confirmar traslado'}
      submitDisabled={!targetId || saving}
      onSubmit={() => void save()}
    >
      <SelectField
        label="Activo de destino"
        value={targetId}
        options={targets}
        onChange={setTargetId}
        className="sm:col-span-2"
      />
    </FormDialog>
  )
}
