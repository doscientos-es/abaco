import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { loadWorkTargetOptions } from '@/features/work-orders/application/work-order-actions'
import { serviceFrequencySelection } from '@/shared/domain/service-periodicity'
import { calendarDate, dateValue, moveDays } from '@/shared/lib/date-range'
import { calendarDays } from '@/shared/lib/event-calendar'
import { printDocument } from '@/shared/lib/print-document'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextareaField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  saveContractJob,
  listCleaningServices,
  type CleaningService,
} from '../application/cleaning-service-actions'
import type { ServiceContract } from '../application/contract-actions'
import {
  contractJobError,
  emptyContractJob,
  jobFrequencyLabels,
  normalizeContractJob,
  quotedJobFrequency,
  suggestedJobFrequency,
  type ContractJobDraft,
} from '../domain/contract-job'
import { minuteLabel, scheduleDays } from '../domain/weekly-schedule'
import { WeeklyScheduleEditor } from './weekly-schedule-editor'

const days = scheduleDays
export const frequencyLabels = jobFrequencyLabels

export function CleaningServicesPanel({
  tenantId,
  contractId,
  targetJobId,
  clientId,
  clientName,
  contractLocationId,
  assignedUserIds,
  workTeamId,
  quotedScope = [],
  startsOn,
  endsOn,
  updatedAt,
  draft,
  editable,
  compact = false,
}: {
  tenantId: string
  contractId: string
  targetJobId?: string
  clientId: string
  clientName: string
  contractLocationId: string | null
  assignedUserIds: string[]
  workTeamId: string | null
  quotedScope?: ServiceContract['included_scope']
  startsOn: string
  endsOn: string | null
  updatedAt: string
  draft: boolean
  editable: boolean
  compact?: boolean
}) {
  const cache = useQueryClient()
  const services = useQuery({
    queryKey: ['cleaning-services', tenantId, contractId],
    queryFn: () => listCleaningServices(tenantId, contractId),
  })
  useEffect(() => {
    if (!targetJobId || !services.data?.some((service) => service.id === targetJobId)) return
    const frame = requestAnimationFrame(() =>
      document.getElementById(targetJobId)?.scrollIntoView({ block: 'start' }),
    )
    return () => cancelAnimationFrame(frame)
  }, [targetJobId, services.data])
  const targets = useQuery({
    queryKey: ['work-target-options', tenantId, clientId],
    queryFn: () => loadWorkTargetOptions(tenantId, clientId),
  })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<ContractJobDraft>(() => emptyContractJob(startsOn))
  const [editingId, setEditingId] = useState<string | null>(null)
  const operation = useRef(new Map<string, string>())
  const sheets = useRef(new Map<string, HTMLElement>())
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }
  const effectiveForm = {
    ...form,
    location_id: contractLocationId,
    ends_on: null,
    assigned_user_ids: assignedUserIds,
    assigned_user_id: [...assignedUserIds].sort()[0] ?? null,
    work_team_id: workTeamId,
  }
  const error = contractJobError(effectiveForm, startsOn, endsOn)
  const weekly = form.frequency === 'weekly' || form.frequency === 'fortnightly'
  const editingService = services.data?.find((service) => service.id === editingId)
  const editingFrequency = editingService ? quotedJobFrequency(editingService, quotedScope) : ''
  const agreedFrequency = suggestedJobFrequency(editingFrequency)
  const periodicity = serviceFrequencySelection({ frequency: editingFrequency }).periodicities[0]
  const daily = periodicity === 'daily'
  const multipleWeeklyDays = daily || periodicity === 'twice_weekly'
  const selectedDays = new Set(form.weekly_slots.map((slot) => slot.weekday)).size
  const agreedDaysError =
    form.frequency === 'weekly' && daily && selectedDays !== 7
      ? 'Marca una franja para cada día de la semana, según el presupuesto.'
      : form.frequency === 'weekly' && periodicity === 'twice_weekly' && selectedDays !== 2
        ? 'Marca franjas en dos días diferentes, según el presupuesto.'
        : null
  function edit(service: CleaningService) {
    const initial = emptyContractJob(startsOn)
    const values = Object.fromEntries(
      Object.keys(initial).map((key) => [key, service[key as keyof ContractJobDraft]]),
    ) as ContractJobDraft
    setForm(
      service.configured
        ? {
            ...values,
            frequency:
              suggestedJobFrequency(quotedJobFrequency(service, quotedScope)) ?? values.frequency,
            weekly_slots: service.weekly_slots?.length
              ? service.weekly_slots
              : (service.frequency === 'weekly' || service.frequency === 'fortnightly') &&
                  service.time_known
                ? service.weekdays.map((weekday) => ({
                    id: `legacy-${weekday}`,
                    weekday,
                    start_minute:
                      Number(service.local_start.slice(0, 2)) * 60 +
                      Number(service.local_start.slice(3, 5)),
                    duration_minutes: service.duration_minutes,
                  }))
                : [],
            local_start: service.time_known ? values.local_start.slice(0, 5) : '',
          }
        : {
            ...initial,
            frequency: suggestedJobFrequency(quotedJobFrequency(service, quotedScope)),
            title: service.title,
            tasks: service.tasks,
            service_type: service.service_type ?? initial.service_type,
            instructions: service.instructions ?? '',
            assigned_user_id: service.assigned_user_id,
            assigned_user_ids: service.assigned_user_ids,
            work_team_id: service.work_team_id,
          },
    )
    setEditingId(service.id)
    setOpen(true)
  }
  async function save() {
    if (
      busy ||
      error ||
      agreedDaysError ||
      !targets.isSuccess ||
      !targets.data.locations.some((l) => l.id === contractLocationId)
    )
      return
    const service = normalizeContractJob(effectiveForm)
    const key = JSON.stringify([editingId, service])
    const id = operation.current.get(key) ?? crypto.randomUUID()
    operation.current.set(key, id)
    setBusy(true)
    try {
      await saveContractJob({
        tenantId,
        contractId,
        jobId: editingId,
        expectedUpdatedAt: updatedAt,
        service,
        operationId: id,
      })
      await cache.invalidateQueries({ queryKey: ['cleaning-services', tenantId, contractId] })
      await cache.invalidateQueries({ queryKey: ['service-contract', tenantId, contractId] })
      await cache.invalidateQueries({ queryKey: ['service-contracts', tenantId] })
      await cache.invalidateQueries({ queryKey: ['contract-jobs', tenantId] })
      await cache.invalidateQueries({ queryKey: ['office-visits', tenantId] })
      operation.current.delete(key)
      setOpen(false)
      setForm(emptyContractJob(startsOn))
      setEditingId(null)
      toast.success('Trabajo guardado')
    } catch (error) {
      toast.error('No se pudo guardar', {
        description: error instanceof Error ? error.message : 'Reintenta.',
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-5" aria-label="Trabajos del contrato">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!compact ? <h2 className="text-lg font-semibold">Trabajos contratados</h2> : null}
        {editable ? (
          <Button
            size="sm"
            variant="outline"
            onPress={() => {
              setForm(emptyContractJob(startsOn))
              setEditingId(null)
              setOpen(true)
            }}
          >
            Añadir trabajo
          </Button>
        ) : null}
      </div>
      {services.isPending ? <output>Cargando servicios…</output> : null}
      {services.isError ? (
        <p role="alert">
          {services.error.message}{' '}
          <Button variant="outline" onPress={() => void services.refetch()}>
            Reintentar
          </Button>
        </p>
      ) : null}
      {services.data?.length === 0 ? (
        <div className="border-border bg-card rounded-xl border border-dashed px-4 py-3">
          <p className="text-muted-foreground text-sm">Todavía no hay trabajos.</p>
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        {services.data?.map((service) => {
          const location = targets.data?.locations.find((item) => item.id === service.location_id)
          const quotedFrequency = quotedJobFrequency(service, quotedScope)
          return (
            <article
              key={service.id}
              id={service.id}
              className="border-border bg-card flex min-w-0 flex-col overflow-hidden rounded-xl border"
            >
              <div
                ref={(node) => {
                  if (node) sheets.current.set(service.id, node)
                  else sheets.current.delete(service.id)
                }}
                className="min-w-0 flex-1 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Trabajo contratado
                    </p>
                    <h3 className="mt-1 text-lg font-semibold break-words">{service.title}</h3>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${service.configured ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}
                  >
                    {service.configured ? 'Configurado' : 'Pendiente de configurar'}
                  </span>
                </div>
                {quotedFrequency ? (
                  <p className="text-muted-foreground mt-3 text-sm">
                    Frecuencia acordada: <strong>{quotedFrequency}</strong>
                  </p>
                ) : null}
                {!service.configured ? (
                  <div className="bg-muted/50 mt-4 rounded-lg p-3">
                    <p className="text-muted-foreground text-xs font-medium">Alcance aceptado</p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">
                      {service.tasks || 'Sin especificar'}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {service.modality === 'fixed'
                        ? 'Hoja permanente del centro'
                        : service.frequency === 'once'
                          ? 'Trabajo puntual'
                          : 'Trabajo periódico móvil'}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">{clientName}</p>
                    <div className="mt-4 hidden print:block">
                      <p className="text-xs font-medium">Centro</p>
                      <p className="text-sm">
                        {service.location?.name ?? location?.name ?? 'Sin centro'}
                      </p>
                      <p className="text-xs">{service.location?.address ?? location?.address}</p>
                    </div>
                    <div className="bg-muted/50 mt-4 grid gap-4 rounded-lg p-4 sm:grid-cols-2">
                      <div className="flex min-w-0 gap-2 text-sm">
                        <span className="text-muted-foreground mt-0.5">{fieldIcons.calendar}</span>
                        <div>
                          <p className="text-muted-foreground text-xs">Planificación del trabajo</p>
                          <p className="mt-1 font-medium">
                            {service.frequency
                              ? frequencyLabels[service.frequency]
                              : 'Pauta por temporada existente'}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            Desde {service.anchor_on ?? startsOn}
                            {service.ends_on ? ` hasta ${service.ends_on}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex min-w-0 gap-2 text-sm">
                        <span className="text-muted-foreground mt-0.5">{fieldIcons.file}</span>
                        <div>
                          <p className="text-muted-foreground text-xs">Horario y duración</p>
                          <p className="mt-1 font-medium">
                            {service.time_known
                              ? service.local_start.slice(0, 5)
                              : 'Sin horario fijo'}{' '}
                            · {service.duration_minutes} min
                          </p>
                        </div>
                      </div>
                    </div>
                    {quotedFrequency && service.frequency === 'once' ? (
                      <p className="text-warning-foreground mt-3 text-xs">
                        La planificación guardada es puntual. Revisa si coincide con la frecuencia
                        acordada.
                      </p>
                    ) : null}
                    {service.weekly_slots?.length ? (
                      <ul
                        className="text-muted-foreground mt-3 flex flex-wrap gap-2 text-xs"
                        aria-label="Franjas de trabajo"
                      >
                        {service.weekly_slots.map((slot) => (
                          <li key={slot.id} className="bg-muted rounded-md px-2 py-1">
                            {days[slot.weekday - 1]} · {minuteLabel(slot.start_minute)}–
                            {minuteLabel(slot.start_minute + slot.duration_minutes)}
                            {slot.start_minute + slot.duration_minutes >= 1440 ? ' (+1 día)' : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-4">
                      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        Tareas y alcance
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-wrap">{service.tasks}</p>
                    </div>
                    {(service.frequency === 'weekly' || service.frequency === 'fortnightly'
                      ? service.weekdays
                      : []
                    ).map((day) => (
                      <p key={day} className="mt-1 text-sm">
                        <strong>{days[day - 1]}: </strong>
                        {service.weekly_tasks[String(day)] || service.tasks}
                      </p>
                    ))}
                    {service.location?.operational_contact ? (
                      <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
                        {service.location.operational_contact}
                      </p>
                    ) : null}
                    {service.location?.access_notes ? (
                      <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
                        {service.location.access_notes}
                      </p>
                    ) : null}
                    {service.location?.notes ? (
                      <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
                        {service.location.notes}
                      </p>
                    ) : null}
                    {service.instructions ? (
                      <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
                        {service.instructions}
                      </p>
                    ) : null}
                    <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-xs">
                      <span>Material: {service.materials || 'Sin especificar'}</span>
                      <span>
                        Conformidad: {service.requires_acceptance ? 'Requerida' : 'No requerida'}
                      </span>
                    </div>
                  </>
                )}
              </div>
              {editable || (service.configured && service.modality === 'fixed') ? (
                <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
                  {editable && (draft || !service.configured) ? (
                    <Button variant="outline" onPress={() => edit(service)}>
                      {service.configured ? 'Editar trabajo' : 'Configurar trabajo'}
                    </Button>
                  ) : editable && service.configured ? (
                    <p className="text-muted-foreground text-xs">
                      No editable mientras el contrato esté activo.
                    </p>
                  ) : null}
                  {service.configured && service.modality === 'fixed' ? (
                    <Button
                      variant="outline"
                      onPress={() => {
                        const sheet = sheets.current.get(service.id)
                        if (sheet)
                          void printDocument(sheet, service.title).catch(() =>
                            toast.error('No se pudo preparar la impresión'),
                          )
                      }}
                    >
                      Imprimir hoja fija
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
      <FormDialog
        open={open}
        wide
        onOpenChange={setOpen}
        title={editingId ? 'Configurar trabajo contratado' : 'Añadir trabajo'}
        submitLabel="Guardar trabajo"
        onSubmit={() => void save()}
        isSubmitting={busy}
        isDirty={Boolean(form.title)}
        submitDisabled={
          Boolean(error) ||
          Boolean(agreedDaysError) ||
          !targets.isSuccess ||
          !targets.data.locations.some((l) => l.id === contractLocationId)
        }
      >
        <TextField
          label="Nombre · obligatorio"
          value={form.title}
          onChange={(v) => set('title', v)}
          maxLength={200}
          placeholder="Cristales"
        />
        {targets.isError ? (
          <p role="alert">
            No se pudieron cargar los centros.{' '}
            <Button variant="outline" onPress={() => void targets.refetch()}>
              Reintentar
            </Button>
          </p>
        ) : null}
        {editingFrequency ? (
          <p className="text-muted-foreground text-sm sm:col-span-2">
            Frecuencia acordada en el presupuesto: <strong>{editingFrequency}</strong>. Completa la
            planificación indicando todos los días y horas acordados.
          </p>
        ) : null}
        {!agreedFrequency ? (
          <SelectField
            label="Frecuencia de planificación"
            value={form.frequency ?? ''}
            placeholder="Selecciona una frecuencia"
            options={Object.entries(frequencyLabels).map(([value, label]) => ({ value, label }))}
            onChange={(v) =>
              setForm((current) => ({
                ...current,
                frequency: (v || null) as ContractJobDraft['frequency'],
                modality: v === 'once' ? 'mobile' : current.modality,
                weekdays: [],
                weekly_slots: [],
              }))
            }
          />
        ) : null}
        {form.frequency === 'monthly' ? (
          <SelectField
            label="Día de la semana favorito · obligatorio"
            value={form.weekdays[0] ? String(form.weekdays[0]) : ''}
            placeholder="Selecciona un día"
            options={days.map((label, index) => ({ value: String(index + 1), label }))}
            onChange={(value) => set('weekdays', value ? [Number(value)] : [])}
          />
        ) : null}
        {weekly && !multipleWeeklyDays ? (
          <SelectField
            label="Día de la semana favorito · obligatorio"
            value={form.weekdays[0] ? String(form.weekdays[0]) : ''}
            placeholder="Selecciona un día"
            options={days.map((label, index) => ({ value: String(index + 1), label }))}
            onChange={(value) => {
              if (!value) return
              const weekday = Number(value)
              setForm((current) => ({
                ...current,
                weekdays: [weekday],
                weekly_slots: current.weekly_slots.map((slot) => ({ ...slot, weekday })),
              }))
            }}
          />
        ) : null}
        {form.frequency === 'once' && !daily ? (
          <SelectField
            label="Día de la semana favorito · obligatorio"
            value={String(((calendarDate(form.anchor_on ?? startsOn).getDay() + 6) % 7) + 1)}
            options={days.map((label, index) => ({ value: String(index + 1), label }))}
            onChange={(value) => {
              const startWeekday = ((calendarDate(startsOn).getDay() + 6) % 7) + 1
              set('anchor_on', moveDays(startsOn, (Number(value) - startWeekday + 7) % 7))
            }}
          />
        ) : null}
        {form.frequency === 'once' ? (
          <>
            <TextField
              label="Duración estimada (min)"
              type="number"
              min={15}
              max={720}
              value={String(form.duration_minutes)}
              onChange={(v) => set('duration_minutes', Number(v))}
              placeholder="120"
            />
            <TextField
              label="Hora prevista opcional"
              type="time"
              value={form.local_start}
              onChange={(v) => set('local_start', v)}
              placeholder="Sin horario fijo"
            />
          </>
        ) : null}
        {form.frequency && form.frequency !== 'once' ? (
          <div className="border-border border-b pb-2 sm:col-span-2">
            <h3 className="font-semibold">Horario de trabajo</h3>
            <p className="text-muted-foreground text-sm">Marca las franjas en el calendario.</p>
          </div>
        ) : null}
        {weekly ? (
          <WeeklyScheduleEditor
            value={form.weekly_slots}
            startsOn={form.anchor_on ?? startsOn}
            endsOn={endsOn ?? ''}
            alternate={form.frequency === 'fortnightly'}
            initialWeekday={form.weekdays[0] ?? 1}
            onChange={(slots) =>
              setForm((current) => ({
                ...current,
                weekly_slots: slots,
                weekdays: [...new Set(slots.map((slot) => slot.weekday))],
              }))
            }
          />
        ) : null}
        {form.frequency === 'monthly' ? (
          <>
            <TextField
              label="Hora prevista · obligatorio"
              type="time"
              value={form.local_start}
              onChange={(v) => set('local_start', v)}
              placeholder="09:00"
            />
            <TextField
              label="Duración estimada (min)"
              type="number"
              min={15}
              max={720}
              value={String(form.duration_minutes)}
              onChange={(v) => set('duration_minutes', Number(v))}
              placeholder="60"
            />
            <p className="text-muted-foreground text-sm sm:col-span-2">
              Se generará una visita el primer día elegido de cada mes dentro de la vigencia del
              contrato. Podrás moverla desde planificación.
            </p>
          </>
        ) : null}
        {form.frequency === 'days15' ? (
          <WeeklyScheduleEditor
            value={
              form.local_start
                ? [
                    {
                      id: 'reference',
                      weekday: ((calendarDate(form.anchor_on ?? startsOn).getDay() + 6) % 7) + 1,
                      start_minute:
                        Number(form.local_start.slice(0, 2)) * 60 +
                        Number(form.local_start.slice(3, 5)),
                      duration_minutes: form.duration_minutes,
                    },
                  ]
                : []
            }
            startsOn={form.anchor_on ?? startsOn}
            endsOn={endsOn ?? ''}
            referenceDate={form.anchor_on ?? startsOn}
            recurrenceLabel={'cada 15 días'}
            onChange={(slots) => {
              const slot = slots[0]
              if (!slot) {
                set('local_start', '')
                return
              }
              const week = calendarDays(calendarDate(form.anchor_on ?? startsOn), 'week')[0]
              setForm((current) => ({
                ...current,
                local_start: minuteLabel(slot.start_minute),
                duration_minutes: slot.duration_minutes,
                anchor_on: week ? moveDays(dateValue(week), slot.weekday - 1) : current.anchor_on,
              }))
            }}
          />
        ) : null}

        <TextareaField
          label="Tareas y alcance"
          value={form.tasks}
          onChange={(v) => set('tasks', v)}
          maxLength={10000}
          placeholder="Qué hay que limpiar"
        />

        <TextareaField
          label="Material y maquinaria"
          value={form.materials}
          onChange={(v) => set('materials', v)}
          maxLength={2000}
          placeholder="Quién aporta los productos, útiles y maquinaria"
        />
        <label>
          <input
            type="checkbox"
            checked={form.requires_acceptance}
            onChange={(e) => set('requires_acceptance', e.target.checked)}
          />{' '}
          Requiere conformidad del cliente
        </label>
        {error || agreedDaysError ? (
          <p className="text-muted-foreground text-sm">{error || agreedDaysError}</p>
        ) : null}
      </FormDialog>
    </section>
  )
}
