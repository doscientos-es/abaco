import { SelectField, TextField } from '@/shared/ui/form'

import type { ContractTaskSchedule } from '../domain/contract-task-assignment'
import { minuteLabel, scheduleDays } from '../domain/weekly-schedule'

const frequencies = [
  { value: 'once', label: 'Una vez' },
  { value: 'weekly', label: 'Cada semana' },
  { value: 'fortnightly', label: 'Cada dos semanas' },
  { value: 'days15', label: 'Cada 15 días' },
  { value: 'monthly', label: 'Cada mes' },
  { value: 'semiannual', label: 'Cada seis meses' },
  { value: 'annual', label: 'Cada año' },
]

export function ContractTaskScheduleEditor({
  schedule,
  disabled,
  onChange,
}: {
  schedule: ContractTaskSchedule
  disabled: boolean
  onChange: (schedule: ContractTaskSchedule) => void
}) {
  function update(changes: Partial<ContractTaskSchedule>) {
    onChange({ ...schedule, ...changes })
  }
  return (
    <fieldset className="space-y-3 rounded-md border p-3" disabled={disabled}>
      <legend className="px-1 text-sm font-medium">Programación de la tarea</legend>
      <SelectField
        label="Frecuencia"
        value={schedule.frequency}
        isDisabled={disabled}
        options={frequencies}
        onChange={(value) => update({ frequency: value as ContractTaskSchedule['frequency'] })}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField
          label="Fecha de referencia"
          type="date"
          value={schedule.anchor_on}
          onChange={(anchor_on) => update({ anchor_on })}
          placeholder="Fecha"
        />
        <TextField
          label="Hora preferente"
          type="time"
          value={minuteLabel(schedule.start_minute)}
          onChange={(value) => {
            const [hour, minute] = value.split(':').map(Number)
            update({
              start_minute: hour === undefined || minute === undefined ? -1 : hour * 60 + minute,
            })
          }}
          placeholder="09:00"
        />
        <TextField
          label="Duración (minutos)"
          type="number"
          min={15}
          max={720}
          value={String(schedule.duration_minutes)}
          onChange={(value) => update({ duration_minutes: Number(value) })}
          placeholder="60"
        />
      </div>
      {schedule.frequency === 'weekly' || schedule.frequency === 'fortnightly' ? (
        <div className="flex flex-wrap gap-3" aria-label="Días de la tarea">
          {scheduleDays.map((day, index) => (
            <label key={day} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={schedule.weekdays.includes(index + 1)}
                onChange={(event) =>
                  update({
                    weekdays: event.target.checked
                      ? [...schedule.weekdays, index + 1].sort((a, b) => a - b)
                      : schedule.weekdays.filter((value) => value !== index + 1),
                  })
                }
              />
              {day}
            </label>
          ))}
        </div>
      ) : null}
    </fieldset>
  )
}
