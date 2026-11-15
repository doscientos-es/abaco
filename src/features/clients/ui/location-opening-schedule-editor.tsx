import { Button } from '@doscientos/ui'

import {
  openingScheduleDays,
  openingScheduleError,
  type OpeningSchedule,
} from '../domain/location-opening-schedule'

export function LocationOpeningScheduleEditor({
  value,
  onChange,
}: {
  value: OpeningSchedule | null
  onChange: (value: OpeningSchedule | null) => void
}) {
  const error = openingScheduleError(value)
  const slots = value ?? []
  const monday = slots.filter(({ weekday }) => weekday === 1)
  const updateDay = (weekday: number, open: boolean) => {
    const otherDays = slots.filter((slot) => slot.weekday !== weekday)
    onChange(open ? [...otherDays, { weekday, start: '09:00', end: '18:00' }] : otherDays)
  }
  const copyMonday = (lastDay: number) => {
    const unchanged = slots.filter(({ weekday }) => weekday === 1 || weekday > lastDay)
    onChange([
      ...unchanged,
      ...Array.from({ length: lastDay - 1 }, (_, i) =>
        monday.map((slot) => ({ ...slot, weekday: i + 2 })),
      ).flat(),
    ])
  }

  return (
    <section className="space-y-3 sm:col-span-2" aria-label="Horario del centro">
      <div>
        <h3 className="text-sm font-medium">Horario del centro</h3>
        <p className="text-muted-foreground text-xs">
          Indica los días abiertos y añade franjas si hay pausas. El horario es opcional.
        </p>
      </div>
      {value === null ? (
        <Button type="button" variant="outline" size="sm" onPress={() => onChange([])}>
          Configurar horario semanal
        </Button>
      ) : (
        <>
          <div className="space-y-3">
            {openingScheduleDays.map((day, index) => {
              const weekday = index + 1
              const daySlots = slots
                .map((slot, i) => ({ slot, i }))
                .filter(({ slot }) => slot.weekday === weekday)
              return (
                <div key={day} className="border-border space-y-2 rounded-lg border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={daySlots.length > 0}
                      onChange={(event) => updateDay(weekday, event.target.checked)}
                    />
                    {day} · {daySlots.length ? 'Abierto' : 'Cerrado'}
                  </label>
                  {daySlots.map(({ slot, i }, slotIndex) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label={`${day}, apertura ${slotIndex + 1}`}
                        className="bg-background rounded border p-2 text-sm"
                        type="time"
                        value={slot.start}
                        onChange={(event) =>
                          onChange(
                            slots.map((item, j) =>
                              j === i ? { ...item, start: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      <span aria-hidden="true">–</span>
                      <input
                        aria-label={`${day}, cierre ${slotIndex + 1}`}
                        className="bg-background rounded border p-2 text-sm"
                        type="time"
                        value={slot.end}
                        onChange={(event) =>
                          onChange(
                            slots.map((item, j) =>
                              j === i ? { ...item, end: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Quitar franja ${slotIndex + 1} de ${day}`}
                        onPress={() => onChange(slots.filter((_, j) => j !== i))}
                      >
                        Quitar
                      </Button>
                    </div>
                  ))}
                  {daySlots.length ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isDisabled={slots.length >= 56}
                      onPress={() => onChange([...slots, { weekday, start: '', end: '' }])}
                    >
                      Añadir franja a {day.toLowerCase()}
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              isDisabled={!monday.length}
              onPress={() => copyMonday(5)}
            >
              Copiar lunes a lunes–viernes
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              isDisabled={!monday.length}
              onPress={() => copyMonday(7)}
            >
              Copiar lunes a toda la semana
            </Button>
            <Button type="button" variant="ghost" size="sm" onPress={() => onChange(null)}>
              Sin horario definido
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Si el cierre es anterior a la apertura, corresponde al día siguiente. 00:00–00:00 indica
            24 horas.
          </p>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
