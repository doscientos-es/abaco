import { Button, toast } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  WeeklyScheduleCalendar,
  type WeeklyCalendarSlot,
} from '@/shared/ui/weekly-schedule-calendar'

import { saveStaffSchedule, staffSchedulesQuery } from '../application/staff-schedule-actions'
import {
  scheduleError,
  weekdays,
  type StaffFunction,
  type StaffPerson,
  type StaffSlot,
} from '../domain/staff-schedule'
import { StaffFunctionPicker } from './staff-function-picker'

const formatTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const parseTime = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  return value && h !== undefined && m !== undefined ? h * 60 + m : -1
}

export function StaffScheduleEditor({
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
  const [slots, setSlots] = useState<StaffSlot[]>(
    () => person.schedule?.slots.map((slot) => ({ ...slot })) ?? [],
  )
  const [functionIds, setFunctionIds] = useState<string[]>(() => person.schedule?.functionIds ?? [])
  const [expectedVersion] = useState(() => person.schedule?.updatedAt ?? null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState(false)
  const error = scheduleError(slots)
  const update = (index: number, patch: Partial<StaffSlot>) =>
    setSlots((current) => current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)))
  const calendarSlots = slots.map((slot, index) => ({
    id: String(index),
    weekday: slot.weekday,
    start_minute: slot.start,
    duration_minutes: slot.end - slot.start,
  }))
  const staffSlot = (slot: WeeklyCalendarSlot): StaffSlot => ({
    weekday: slot.weekday,
    start: slot.start_minute,
    end: slot.start_minute + slot.duration_minutes,
  })
  function apply(next: StaffSlot[]) {
    const nextError = scheduleError(next)
    if (nextError) toast.error(nextError)
    else setSlots(next)
  }

  async function save() {
    if (error || busy) return
    setBusy(true)
    setMessage('')
    try {
      await saveStaffSchedule(tenantId, person.userId, expectedVersion, slots, functionIds)
      await client.invalidateQueries({ queryKey: staffSchedulesQuery(tenantId).queryKey })
      onClose()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar el horario.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="border-border bg-card space-y-4 rounded-xl border p-5"
      aria-label={`Editar horario de ${person.name}`}
    >
      <div>
        <h2 className="font-semibold">Editar horario de {person.name}</h2>
        <p className="text-muted-foreground text-sm">
          Semana tipo; añade varias franjas por día si hay pausas. Para un turno nocturno usa dos
          días; como fin, 00:00 significa medianoche.
        </p>
      </div>
      <StaffFunctionPicker functions={functions} selected={functionIds} onChange={setFunctionIds} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Dibuja el horario semanal</h3>
          <p className="text-muted-foreground text-sm">
            Arrastra para añadir turnos; también puedes moverlos o ampliar su borde inferior.
          </p>
        </div>
        <Button
          variant="outline"
          onPress={() => {
            const monday = slots.filter((slot) => slot.weekday === 1)
            if (!monday.length) {
              toast.error('Marca primero el horario del lunes.')
              return
            }
            apply([
              ...slots.filter((slot) => slot.weekday > 5),
              ...[1, 2, 3, 4, 5].flatMap((weekday) => monday.map((slot) => ({ ...slot, weekday }))),
            ])
          }}
        >
          Copiar lunes a lunes–viernes
        </Button>
      </div>
      <WeeklyScheduleCalendar
        label={`Semana tipo de ${person.name}`}
        eventTitle={`Horario de ${person.name}`}
        slots={calendarSlots}
        onOpen={() => setEditing(true)}
        onAdd={(slot) => apply([...slots, staffSlot(slot)])}
        onUpdate={(slot) =>
          apply(slots.map((item, index) => (String(index) === slot.id ? staffSlot(slot) : item)))
        }
      />
      <output className="block text-sm" aria-live="polite">
        {slots.length} franjas ·{' '}
        {slots.reduce((total, slot) => total + slot.end - slot.start, 0) / 60} h por semana
      </output>
      <details
        className="rounded-lg border p-3"
        open={editing || slots.length === 0}
        onToggle={(event) => setEditing(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium">
          Editar horas sin arrastrar o eliminar franjas
        </summary>
        <div className="mt-3 space-y-2">
          <h3 className="font-medium">Franjas semanales</h3>
          {slots.map((slot, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                Día
                <select
                  className="bg-background block rounded border p-2"
                  value={slot.weekday}
                  onChange={(event) => update(index, { weekday: Number(event.target.value) })}
                >
                  {weekdays.map((day, i) => (
                    <option key={day} value={i + 1}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Inicio
                <input
                  aria-label={`Inicio de franja ${index + 1}`}
                  className="bg-background block rounded border p-2"
                  type="time"
                  value={slot.start >= 0 && slot.start < 1440 ? formatTime(slot.start) : ''}
                  onChange={(event) => update(index, { start: parseTime(event.target.value) })}
                />
              </label>
              <label className="text-sm">
                Fin
                <input
                  aria-label={`Fin de franja ${index + 1}`}
                  className="bg-background block rounded border p-2"
                  type="time"
                  value={
                    slot.end === 1440
                      ? '00:00'
                      : slot.end >= 0 && slot.end < 1440
                        ? formatTime(slot.end)
                        : ''
                  }
                  onChange={(event) => {
                    const time = parseTime(event.target.value)
                    update(index, { end: time === 0 ? 1440 : time })
                  }}
                />
              </label>
              <Button
                variant="outline"
                aria-label={`Quitar franja ${index + 1}`}
                onPress={() => setSlots((current) => current.filter((_, i) => i !== index))}
              >
                Quitar
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            isDisabled={slots.length >= 56}
            onPress={() =>
              setSlots((current) => [...current, { weekday: 1, start: 540, end: 1020 }])
            }
          >
            Añadir franja
          </Button>
        </div>
      </details>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="text-destructive text-sm">
          {message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button isDisabled={!!error || busy} onPress={() => void save()}>
          Guardar horario y funciones
        </Button>
        <Button variant="outline" isDisabled={busy} onPress={onClose}>
          Cancelar
        </Button>
      </div>
    </section>
  )
}
