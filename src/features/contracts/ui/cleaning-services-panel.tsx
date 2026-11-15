import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import {
  RelatedCreateButton,
  useRelatedRecordCreation,
} from '@/features/clients/ui/related-record-creation'
import { listTechnicians } from '@/features/visits/application/visit-actions'
import { loadWorkTargetOptions } from '@/features/work-orders/application/work-order-actions'
import { workTeamsQuery } from '@/features/work-teams/application/work-team-actions'
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
import {
  contractJobError,
  emptyContractJob,
  jobFrequencyLabels,
  normalizeContractJob,
  type ContractJobDraft,
} from '../domain/contract-job'
import { minuteLabel, scheduleDays } from '../domain/weekly-schedule'
import { ContractResponsiblePicker } from './contract-responsible-picker'
import { WeeklyScheduleEditor } from './weekly-schedule-editor'

const days = scheduleDays
export const frequencyLabels = jobFrequencyLabels

export function CleaningServicesPanel({
  tenantId,
  contractId,
  targetJobId,
  clientId,
  clientName,
  startsOn,
  endsOn,
  updatedAt,
  draft,
  editable,
}: {
  tenantId: string
  contractId: string
  targetJobId?: string
  clientId: string
  clientName: string
  startsOn: string
  endsOn: string | null
  updatedAt: string
  draft: boolean
  editable: boolean
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
  const teams = useQuery(workTeamsQuery(tenantId))
  const people = useQuery({
    queryKey: ['technicians', tenantId],
    queryFn: () => listTechnicians(tenantId),
  })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<ContractJobDraft>(() => emptyContractJob(startsOn))
  const [editingId, setEditingId] = useState<string | null>(null)
  const related = useRelatedRecordCreation({
    tenantId,
    clientId,
    onLocationCreated: (id) => set('location_id', id),
  })
  const operation = useRef(new Map<string, string>())
  const sheets = useRef(new Map<string, HTMLElement>())
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }
  const error = contractJobError(form, startsOn, endsOn)
  const weekly = form.frequency === 'weekly' || form.frequency === 'fortnightly'
  function edit(service: CleaningService) {
    const initial = emptyContractJob(startsOn)
    const values = Object.fromEntries(
      Object.keys(initial).map((key) => [key, service[key as keyof ContractJobDraft]]),
    ) as ContractJobDraft
    setForm(
      service.configured
        ? {
            ...values,
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
            title: service.title,
            tasks: service.tasks,
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
    if (busy || error || related.pending) return
    const service = normalizeContractJob(form)
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Trabajos contratados</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Consulta y configura los trabajos incluidos en este contrato.
          </p>
        </div>
        {editable ? (
          <Button
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
        <div className="border-border bg-card rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Todavía no hay trabajos</p>
          {editable ? (
            <p className="text-muted-foreground mt-1 text-sm">
              Añade el primer trabajo de este contrato.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        {services.data?.map((service) => {
          const location = targets.data?.locations.find((item) => item.id === service.location_id)
          const responsible = service.work_team_id
            ? (teams.data?.find((team) => team.id === service.work_team_id)?.name ??
              'Equipo no disponible')
            : service.assigned_user_ids
                .map(
                  (id) =>
                    people.data?.find((person) => person.id === id)?.label ??
                    'Persona no disponible',
                )
                .join(', ') || 'Sin asignar'
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
                    <div className="bg-muted/50 mt-4 grid gap-4 rounded-lg p-4 sm:grid-cols-2">
                      <div className="flex min-w-0 gap-2 text-sm">
                        <span className="text-muted-foreground mt-0.5">{fieldIcons.pin}</span>
                        <div className="min-w-0">
                          <p className="text-muted-foreground text-xs">Centro</p>
                          <p className="mt-1 font-medium break-words">
                            {service.location?.name ?? location?.name ?? 'Sin centro'}
                          </p>
                          <p className="text-muted-foreground text-xs break-words">
                            {service.location?.address ?? location?.address}
                          </p>
                        </div>
                      </div>
                      <div className="flex min-w-0 gap-2 text-sm">
                        <span className="text-muted-foreground mt-0.5">{fieldIcons.user}</span>
                        <div className="min-w-0">
                          <p className="text-muted-foreground text-xs">Responsables</p>
                          <p className="mt-1 font-medium break-words">{responsible}</p>
                        </div>
                      </div>
                      <div className="flex min-w-0 gap-2 text-sm">
                        <span className="text-muted-foreground mt-0.5">{fieldIcons.calendar}</span>
                        <div>
                          <p className="text-muted-foreground text-xs">Frecuencia</p>
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
                    {service.weekdays.map((day) => (
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
          related.pending ||
          !targets.isSuccess ||
          !targets.data.locations.some((l) => l.id === form.location_id)
        }
      >
        <div className="border-border border-b pb-2 sm:col-span-2">
          <h3 className="font-semibold">Datos del trabajo</h3>
          <p className="text-muted-foreground text-sm">
            Identifica el trabajo y el centro donde se realiza.
          </p>
        </div>
        <TextField
          label="Nombre · obligatorio"
          value={form.title}
          onChange={(v) => set('title', v)}
          maxLength={200}
          placeholder="Cristales"
        />
        <SelectField
          label="Centro · obligatorio"
          value={form.location_id ?? ''}
          options={[
            { value: '', label: 'Selecciona un centro' },
            ...(targets.data?.locations ?? []).map((l) => ({ value: l.id, label: l.name })),
          ]}
          onChange={(v) => set('location_id', v)}
        />
        {related.allowed ? (
          <RelatedCreateButton
            label="Crear centro"
            disabled={busy || related.pending}
            onPress={() => related.start('location')}
          />
        ) : null}
        {targets.isError ? (
          <p role="alert">
            No se pudieron cargar los centros.{' '}
            <Button variant="outline" onPress={() => void targets.refetch()}>
              Reintentar
            </Button>
          </p>
        ) : null}
        {related.status}
        <SelectField
          label="Tipo"
          value={form.service_type}
          options={[
            { value: 'ordinary', label: 'Limpieza ordinaria' },
            { value: 'windows', label: 'Cristales' },
            { value: 'garage', label: 'Garaje' },
            { value: 'other', label: 'Otro' },
          ]}
          onChange={(v) => set('service_type', v as CleaningService['service_type'])}
        />
        <SelectField
          label="Modalidad"
          value={form.modality}
          options={[
            { value: 'fixed', label: 'Hoja fija de centro' },
            { value: 'mobile', label: 'Visitas de equipo móvil' },
          ]}
          isDisabled={form.frequency === 'once'}
          onChange={(v) => set('modality', v as CleaningService['modality'])}
        />
        <SelectField
          label="Frecuencia"
          value={form.frequency ?? 'weekly'}
          options={Object.entries(frequencyLabels).map(([value, label]) => ({ value, label }))}
          onChange={(v) =>
            setForm((current) => ({
              ...current,
              frequency: v as ContractJobDraft['frequency'],
              modality: v === 'once' ? 'mobile' : current.modality,
            }))
          }
        />
        <TextField
          label={
            form.frequency === 'once'
              ? 'Fecha prevista · obligatorio'
              : 'Inicio y fecha de referencia · obligatorio'
          }
          type="date"
          value={form.anchor_on ?? ''}
          onChange={(v) => set('anchor_on', v)}
          placeholder="Fecha"
        />
        {form.frequency !== 'once' ? (
          <TextField
            label="Fin del trabajo (por defecto, fin del contrato)"
            type="date"
            value={form.ends_on ?? ''}
            onChange={(v) => set('ends_on', v || null)}
            placeholder={endsOn ?? 'Guarda primero el fin del contrato'}
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
        <ContractResponsiblePicker
          people={people.data ?? []}
          teams={teams.data ?? []}
          selected={{ people: form.assigned_user_ids, team: form.work_team_id }}
          disabled={busy || !people.isSuccess || !teams.isSuccess}
          onChange={({ people: ids, team }) =>
            setForm((current) => ({
              ...current,
              assigned_user_ids: ids,
              assigned_user_id: [...ids].sort()[0] ?? null,
              work_team_id: team,
            }))
          }
        />
        {people.isError ? (
          <p role="alert">
            No se pudieron cargar las personas.{' '}
            <Button variant="outline" onPress={() => void people.refetch()}>
              Reintentar
            </Button>
          </p>
        ) : null}
        {form.assigned_user_ids.length > 1 && form.modality === 'mobile' ? (
          <p className="text-muted-foreground text-sm sm:col-span-2">
            El trabajo conserva todas las personas. Las visitas generadas solo asignan a{' '}
            {people.data?.find((person) => person.id === form.assigned_user_id)?.label ??
              'una persona'}
            ; las demás no reciben acceso ni reserva de agenda automáticamente.
          </p>
        ) : null}
        {teams.isError ? (
          <p role="alert">
            No se pudieron cargar los equipos.{' '}
            <Button variant="outline" onPress={() => void teams.refetch()}>
              Reintentar
            </Button>
          </p>
        ) : null}
        {form.frequency !== 'once' ? (
          <div className="border-border border-b pb-2 sm:col-span-2">
            <h3 className="font-semibold">Horario de trabajo</h3>
            <p className="text-muted-foreground text-sm">Marca las franjas en el calendario.</p>
          </div>
        ) : null}
        {weekly ? (
          <WeeklyScheduleEditor
            value={form.weekly_slots}
            startsOn={form.anchor_on ?? startsOn}
            endsOn={form.ends_on ?? endsOn ?? ''}
            alternate={form.frequency === 'fortnightly'}
            onChange={(slots) =>
              setForm((current) => ({
                ...current,
                weekly_slots: slots,
                weekdays: [...new Set(slots.map((slot) => slot.weekday))],
              }))
            }
          />
        ) : null}
        {!weekly && form.frequency !== 'once' ? (
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
            endsOn={form.ends_on ?? endsOn ?? ''}
            referenceDate={form.anchor_on ?? startsOn}
            recurrenceLabel={
              form.frequency === 'monthly' ? 'cada mes en el día de referencia' : 'cada 15 días'
            }
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
        <div className="border-border border-b pb-2 sm:col-span-2">
          <h3 className="font-semibold">Tareas e instrucciones</h3>
          <p className="text-muted-foreground text-sm">
            Describe el alcance y los materiales necesarios.
          </p>
        </div>
        <TextareaField
          label="Tareas y alcance"
          value={form.tasks}
          onChange={(v) => set('tasks', v)}
          maxLength={10000}
          placeholder="Qué hay que limpiar"
        />
        {form.frequency === 'weekly' || form.frequency === 'fortnightly' ? (
          <fieldset className="space-y-2 sm:col-span-2">
            <legend>Tareas específicas de cada día (opcional)</legend>
            {days.map((label, index) => {
              const day = index + 1
              if (!form.weekly_slots.some((slot) => slot.weekday === day)) return null
              return (
                <div key={day} className="flex items-center gap-3">
                  <span>{label}</span>
                  {form.weekly_slots.some((slot) => slot.weekday === day) ? (
                    <input
                      aria-label={`Tareas del ${label}`}
                      className="bg-background min-w-0 flex-1 rounded border p-2"
                      value={form.weekly_tasks[String(day)] ?? ''}
                      onChange={(e) =>
                        set('weekly_tasks', { ...form.weekly_tasks, [day]: e.target.value })
                      }
                    />
                  ) : null}
                </div>
              )
            })}
          </fieldset>
        ) : null}
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
        {error ? <p className="text-muted-foreground text-sm">{error}</p> : null}
        <p className="text-muted-foreground text-sm sm:col-span-2">
          {form.modality === 'fixed'
            ? 'Genera una hoja permanente para dejar en el centro y facilitar sustituciones.'
            : 'Genera una orden por fecha prevista. Cada cambio de fecha conserva la referencia original, el motivo y el historial.'}{' '}
          La frecuencia del trabajo es independiente del periodo de facturación.
        </p>
      </FormDialog>
      {related.dialogs}
    </section>
  )
}
