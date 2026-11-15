import { Button } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { teamQuery } from '@/features/settings/application/team-actions'
import { FormDialog } from '@/shared/ui/form-dialog'
import { MultiSelectField } from '@/shared/ui/multi-select-field'

import { saveFunctionPeople } from '../application/staff-function-people'
import { staffSchedulesQuery } from '../application/staff-schedule-actions'
import type { StaffFunction, StaffPerson } from '../domain/staff-schedule'

export function StaffFunctionPeopleDialog({
  tenantId,
  staffFunction,
  onClose,
}: {
  tenantId: string
  staffFunction: StaffFunction
  onClose: () => void
}) {
  const team = useQuery(teamQuery(tenantId))
  const schedules = useQuery(staffSchedulesQuery(tenantId))

  if (team.isSuccess && schedules.isSuccess) {
    const schedulesByUser = new Map(schedules.data.map((schedule) => [schedule.userId, schedule]))
    const people: StaffPerson[] = team.data.map((member) => ({
      userId: member.userId,
      name: member.fullName || member.email,
      schedule: schedulesByUser.get(member.userId) ?? null,
    }))
    return (
      <PeopleForm
        tenantId={tenantId}
        staffFunction={staffFunction}
        people={people}
        onClose={onClose}
      />
    )
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={`Trabajadores · ${staffFunction.name}`}
      submitLabel="Guardar"
      submitDisabled
      onSubmit={() => {}}
    >
      {team.isError || schedules.isError ? (
        <p role="alert">
          No se pudieron cargar los trabajadores o sus funciones. Cierra y vuelve a intentarlo.
        </p>
      ) : (
        <p>Cargando trabajadores…</p>
      )}
    </FormDialog>
  )
}

function PeopleForm({
  tenantId,
  staffFunction,
  people,
  onClose,
}: {
  tenantId: string
  staffFunction: StaffFunction
  people: StaffPerson[]
  onClose: () => void
}) {
  const client = useQueryClient()
  const [snapshot] = useState(() => people)
  const [original] = useState(() =>
    snapshot
      .filter((person) => person.schedule?.functionIds.includes(staffFunction.id))
      .map((person) => person.userId),
  )
  const [selected, setSelected] = useState(original)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const dirty = selected.length !== original.length || selected.some((id) => !original.includes(id))

  async function save() {
    if (!dirty || busy || failure) return
    setBusy(true)
    try {
      const failed = await saveFunctionPeople(tenantId, staffFunction.id, snapshot, selected)
      await client.invalidateQueries({ queryKey: staffSchedulesQuery(tenantId).queryKey })
      if (failed.length) {
        setFailure(
          `No se pudieron actualizar: ${failed.map((person) => person.name).join(', ')}. Los demás cambios sí se han guardado. Cierra y vuelve a abrir para revisar y reintentar.`,
        )
      } else onClose()
    } catch {
      setFailure(
        'No se pudo comprobar el resultado. Cierra y vuelve a abrir para revisar las asignaciones.',
      )
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
      title={`Trabajadores · ${staffFunction.name}`}
      description="Selecciona quién desempeña esta función. No se modifican sus horarios ni sus demás funciones."
      submitLabel={busy ? 'Guardando…' : 'Guardar trabajadores'}
      submitDisabled={!dirty || !!failure}
      isSubmitting={busy}
      isDirty={dirty && !failure}
      onSubmit={() => void save()}
    >
      {snapshot.length ? (
        <div className="space-y-3 sm:col-span-2">
          <MultiSelectField
            label="Trabajadores asignados"
            options={snapshot.map((person) => ({ value: person.userId, label: person.name }))}
            value={selected}
            onChange={setSelected}
            isDisabled={busy || !!failure}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              isDisabled={busy || !!failure}
              onPress={() => setSelected(snapshot.map((person) => person.userId))}
            >
              Seleccionar todos
            </Button>
            <Button
              variant="outline"
              isDisabled={busy || !!failure || !selected.length}
              onPress={() => setSelected([])}
            >
              Quitar todos
            </Button>
          </div>
        </div>
      ) : (
        <p>No hay trabajadores en la empresa.</p>
      )}
      {failure ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {failure}
        </p>
      ) : null}
    </FormDialog>
  )
}
