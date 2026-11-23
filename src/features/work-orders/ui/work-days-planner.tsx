import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  toast,
} from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale'

import { listTechnicians } from '@/features/visits/application/visit-actions'
import { calendarDate, dateValue, todayInMadrid } from '@/shared/lib/date-range'
import { SelectField, TextField } from '@/shared/ui/form'

import 'react-day-picker/style.css'
import '@/shared/ui/date-range-picker.css'

import {
  listWorkDayVisits,
  saveWorkDays,
  type WorkDayVisit,
} from '../application/work-days-actions'
import { loadWorkTargetOptions, type WorkOrder } from '../application/work-order-actions'
import { workDayChanges, workVisitDay } from '../domain/work-days'

export function WorkDaysPlanner({ tenantId, order }: { tenantId: string; order: WorkOrder }) {
  const queryClient = useQueryClient()
  const key = ['work-days', tenantId, order.id]
  const visits = useQuery({ queryKey: key, queryFn: () => listWorkDayVisits(tenantId, order.id) })
  const locations = useQuery({
    queryKey: ['work-target-options', tenantId, order.client_id],
    queryFn: () => loadWorkTargetOptions(tenantId, order.client_id),
  })
  const technicians = useQuery({
    queryKey: ['technicians', tenantId],
    queryFn: () => listTechnicians(tenantId),
  })
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [reloadRequired, setReloadRequired] = useState(false)
  const [message, setMessage] = useState('')
  const operations = useRef(new Map<string, string>())
  const location = locations.data?.locations.find((item) => item.id === order.location_id)

  async function reload() {
    const current = await listWorkDayVisits(tenantId, order.id)
    queryClient.setQueryData(key, current)
    setRevision((value) => value + 1)
    setReloadRequired(false)
    void queryClient.invalidateQueries({ queryKey: ['office-visits', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['my-visits', tenantId] })
  }

  async function save(
    baseVisits: WorkDayVisit[],
    selectedDays: string[],
    localTime: string,
    durationMinutes: number,
    assignedUserId: string,
  ) {
    if (!visits.data || busy || reloadRequired) return
    setBusy(true)
    setMessage('')
    let failure: unknown
    try {
      const current = await listWorkDayVisits(tenantId, order.id)
      const version = (items: WorkDayVisit[]) =>
        JSON.stringify(items.map((visit) => [visit.id, visit.updated_at]))
      if (version(current) !== version(baseVisits))
        throw new Error('La planificación ha cambiado en otra sesión.')
      await saveWorkDays(
        {
          tenantId,
          order,
          visits: baseVisits,
          selectedDays,
          localTime,
          durationMinutes,
          assignedUserId: assignedUserId || null,
          timezone: location?.timezone ?? 'Europe/Madrid',
        },
        operations.current,
      )
    } catch (error) {
      failure = error
    }
    try {
      await reload()
      if (failure)
        setMessage(
          `Algunos cambios podrían haberse guardado. Revisa los días y vuelve a intentarlo: ${failure instanceof Error ? failure.message : 'Error de conexión.'}`,
        )
      else toast.success('Días de trabajo guardados en la agenda')
    } catch {
      setReloadRequired(true)
      setMessage(
        'No se pudo comprobar qué cambios se guardaron. Recarga los días antes de continuar.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card id="planificacion">
      <CardHeader>
        <CardTitle>Planear trabajo</CardTitle>
        <CardDescription>
          Selecciona los días de esta obra. Cada día aparece en la agenda; puedes añadir o quitar
          días después.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? (
          <p role="alert" className="text-destructive text-sm">
            {message}
          </p>
        ) : null}
        {reloadRequired ? (
          <Button
            variant="outline"
            isDisabled={busy}
            onPress={() => {
              setBusy(true)
              void reload()
                .then(() => setMessage('Días actualizados. Revisa la planificación.'))
                .catch(() => setMessage('No se pudieron recargar los días. Inténtalo de nuevo.'))
                .finally(() => setBusy(false))
            }}
          >
            Recargar días
          </Button>
        ) : null}
        {visits.isPending || locations.isPending || technicians.isPending ? (
          <output>Cargando planificación…</output>
        ) : null}
        {visits.isError || locations.isError || technicians.isError ? (
          <div role="alert" className="space-y-2 text-sm">
            <p>No se pudo cargar la planificación.</p>
            <Button
              variant="outline"
              onPress={() => {
                void visits.refetch()
                void locations.refetch()
                void technicians.refetch()
              }}
            >
              Reintentar
            </Button>
          </div>
        ) : null}
        {visits.data && locations.data && technicians.data ? (
          <WorkDaysEditor
            key={revision}
            visits={visits.data}
            technicians={technicians.data}
            disabled={busy || reloadRequired || order.status === 'canceled'}
            locationMissing={Boolean(order.location_id && !location)}
            onSave={save}
          />
        ) : null}
        {order.status === 'canceled' ? (
          <p className="text-muted-foreground text-sm">
            La obra está cancelada y no admite nuevos días.
          </p>
        ) : null}
        <Link
          to="/trabajos"
          search={{ view: 'calendar' }}
          className="text-primary text-sm underline"
        >
          Ver agenda de trabajos
        </Link>
      </CardContent>
    </Card>
  )
}

function WorkDaysEditor({
  visits,
  technicians,
  disabled,
  locationMissing,
  onSave,
}: {
  visits: WorkDayVisit[]
  technicians: { id: string; label: string }[]
  disabled: boolean
  locationMissing: boolean
  onSave: (
    visits: WorkDayVisit[],
    days: string[],
    time: string,
    duration: number,
    technician: string,
  ) => Promise<void>
}) {
  const [baseVisits] = useState(visits)
  const initialDays = [...new Set(baseVisits.map(workVisitDay))].sort()
  const lockedDays = new Set(
    baseVisits.filter((visit) => visit.status !== 'scheduled').map(workVisitDay),
  )
  const [days, setDays] = useState(initialDays)
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState('60')
  const [technician, setTechnician] = useState('')
  const changes = workDayChanges(baseVisits, days)
  const dirty = changes.add.length > 0 || changes.remove.length > 0
  const minutes = Number(duration)
  const valid =
    /^\d{2}:\d{2}$/.test(time) && Number.isInteger(minutes) && minutes >= 15 && minutes <= 720
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled && dirty && (changes.add.length === 0 || (valid && !locationMissing)))
          void onSave(baseVisits, days, time, minutes, technician)
      }}
    >
      <fieldset className="date-range-picker" disabled={disabled}>
        <legend className="sr-only">Días de la obra</legend>
        <DayPicker
          mode="multiple"
          locale={es}
          weekStartsOn={1}
          defaultMonth={calendarDate(initialDays[0] ?? todayInMadrid())}
          selected={days.map(calendarDate)}
          disabled={(day) => disabled || lockedDays.has(dateValue(day))}
          onSelect={(selected) =>
            setDays([...new Set([...(selected ?? []).map(dateValue), ...lockedDays])].sort())
          }
          aria-label="Seleccionar días de trabajo"
        />
      </fieldset>
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {days.length
          ? `Días seleccionados: ${days.join(', ')}`
          : 'Todavía no hay días seleccionados.'}
      </p>
      {lockedDays.size ? (
        <p className="text-muted-foreground text-xs">
          Los días con visitas iniciadas, finalizadas u omitidas se conservan en el historial y no
          pueden quitarse aquí.
        </p>
      ) : null}
      {changes.add.length ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Hora de inicio de los nuevos días"
            type="time"
            value={time}
            onChange={setTime}
            placeholder="09:00"
          />
          <TextField
            label="Duración en minutos"
            type="number"
            min={15}
            max={720}
            value={duration}
            onChange={setDuration}
            placeholder="60"
          />
          <SelectField
            label="Asignar nuevos días a"
            isDisabled={disabled}
            value={technician}
            onChange={setTechnician}
            options={[
              { value: '', label: 'Sin asignar' },
              ...technicians.map((item) => ({ value: item.id, label: item.label })),
            ]}
          />
          <p className="text-muted-foreground text-xs sm:col-span-3">
            Estos datos solo se aplican a los días nuevos. Puedes cambiar cada visita desde la
            agenda.
          </p>
        </div>
      ) : null}
      {locationMissing && changes.add.length ? (
        <p role="alert" className="text-destructive text-sm">
          La ubicación de la obra no está disponible; no se pueden añadir días.
        </p>
      ) : null}
      <Button
        type="submit"
        isDisabled={disabled || !dirty || (changes.add.length > 0 && (!valid || locationMissing))}
      >
        {disabled ? 'Planificación no disponible' : 'Guardar días'}
      </Button>
    </form>
  )
}
