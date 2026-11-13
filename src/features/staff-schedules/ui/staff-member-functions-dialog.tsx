import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { FormDialog } from '@/shared/ui/form-dialog'

import { saveStaffSchedule, staffSchedulesQuery } from '../application/staff-schedule-actions'
import type { StaffFunction, StaffPerson } from '../domain/staff-schedule'
import { StaffFunctionPicker } from './staff-function-picker'

export function StaffMemberFunctionsDialog({
  tenantId,
  person,
  functions,
  onClose,
}: {
  tenantId: string
  person: StaffPerson
  functions: StaffFunction[]
  onClose: () => void
}) {
  const client = useQueryClient()
  const [schedule] = useState(() => person.schedule)
  const [selected, setSelected] = useState(() => schedule?.functionIds ?? [])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const original = schedule?.functionIds ?? []
  const dirty = selected.length !== original.length || selected.some((id) => !original.includes(id))

  async function save() {
    if (busy || !dirty) return
    setBusy(true)
    setMessage('')
    try {
      await saveStaffSchedule(
        tenantId,
        person.userId,
        schedule?.updatedAt ?? null,
        schedule?.slots ?? [],
        selected,
      )
      await client.invalidateQueries({ queryKey: staffSchedulesQuery(tenantId).queryKey })
      onClose()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron guardar las funciones.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={`Funciones de ${person.name}`}
      description="Selecciona todas las funciones que desempeña esta persona. No modifican sus permisos ni su horario."
      submitLabel={busy ? 'Guardando…' : 'Guardar funciones'}
      submitDisabled={!dirty}
      isSubmitting={busy}
      isDirty={dirty}
      onSubmit={() => void save()}
    >
      <StaffFunctionPicker functions={functions} selected={selected} onChange={setSelected} />
      {message ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {message}
        </p>
      ) : null}
    </FormDialog>
  )
}
