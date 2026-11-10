import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { listTechnicians } from '@/features/visits/application/visit-actions'
import { loadWorkTargetOptions } from '@/features/work-orders/application/work-order-actions'
import { workTeamsQuery } from '@/features/work-teams/application/work-team-actions'
import { printDocument } from '@/shared/lib/print-document'
import { SelectField, TextareaField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  addCleaningService,
  listCleaningServices,
  type CleaningService,
} from '../application/cleaning-service-actions'

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export const frequencyLabels = {
  weekly: 'Cada semana',
  fortnightly: 'Cada dos semanas (14 días)',
  days15: 'Cada 15 días',
  monthly: 'Mensual · último día si no existe la fecha; conserva la referencia futura',
}

export function CleaningServicesPanel({
  tenantId,
  contractId,
  clientId,
  clientName,
  startsOn,
  editable,
}: {
  tenantId: string
  contractId: string
  clientId: string
  clientName: string
  startsOn: string
  editable: boolean
}) {
  const cache = useQueryClient()
  const services = useQuery({
    queryKey: ['cleaning-services', tenantId, contractId],
    queryFn: () => listCleaningServices(tenantId, contractId),
  })
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
  const [form, setForm] = useState<Omit<CleaningService, 'id' | 'time_known'>>({
    title: '',
    location_id: '',
    modality: 'mobile',
    service_type: 'windows',
    frequency: 'monthly',
    anchor_on: startsOn,
    ends_on: null,
    weekdays: [1, 3, 5],
    tasks: '',
    weekly_tasks: {},
    instructions: '',
    requires_acceptance: true,
    duration_minutes: 120,
    local_start: '',
    assigned_user_id: null,
    work_team_id: null,
  })
  const operation = useRef(new Map<string, string>())
  const sheets = useRef(new Map<string, HTMLElement>())
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }
  async function save() {
    if (busy) return
    const key = JSON.stringify(form)
    const id = operation.current.get(key) ?? crypto.randomUUID()
    operation.current.set(key, id)
    setBusy(true)
    try {
      await addCleaningService(tenantId, contractId, form, id)
      await cache.invalidateQueries({ queryKey: ['cleaning-services', tenantId, contractId] })
      await cache.invalidateQueries({ queryKey: ['service-contract', tenantId, contractId] })
      setOpen(false)
      set('title', '')
      toast.success('Servicio guardado')
    } catch (error) {
      toast.error('No se pudo guardar', {
        description: error instanceof Error ? error.message : 'Reintenta.',
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label="Servicios del contrato">
      <h2 className="text-lg font-semibold">Servicios y hojas fijas</h2>
      <p className="text-muted-foreground text-sm">
        Cada servicio tiene su propio centro y pauta. La hoja fija no genera partes diarios.
      </p>
      {services.isPending ? <output>Cargando servicios…</output> : null}
      {services.isError ? (
        <p role="alert">
          {services.error.message}{' '}
          <Button variant="outline" onPress={() => void services.refetch()}>
            Reintentar
          </Button>
        </p>
      ) : null}
      {services.data?.length === 0 ? <p>Aún no hay servicios.</p> : null}
      {services.data?.map((service) => (
        <article key={service.id} className="space-y-2 border-b pb-4">
          <div
            ref={(node) => {
              if (node) sheets.current.set(service.id, node)
              else sheets.current.delete(service.id)
            }}
            className="paper-sheet space-y-3"
          >
            <h3 className="font-semibold">
              {service.modality === 'fixed' ? 'Hoja fija de centro' : 'Servicio móvil'} ·{' '}
              {service.title}
            </h3>
            <p>
              {clientName} · {service.location?.name ?? targets.data?.locations.find((l) => l.id === service.location_id)?.name} ·{' '}
              {service.location?.address ?? targets.data?.locations.find((l) => l.id === service.location_id)?.address}
            </p>
            <p className="whitespace-pre-wrap">{service.location?.operational_contact}</p>
            <p className="whitespace-pre-wrap">{service.location?.access_notes}</p>
            <p className="whitespace-pre-wrap">{service.location?.notes}</p>
            <p>{service.time_known ? `Hora prevista: ${service.local_start.slice(0, 5)}` : 'Sin horario fijo'} · {teams.data?.find(t => t.id === service.work_team_id)?.name || people.data?.find(p => p.id === service.assigned_user_id)?.label || 'Sin asignar'}</p>
            <p>
              {service.frequency
                ? frequencyLabels[service.frequency]
                : 'Pauta por temporada existente'}{' '}
              · Desde {service.anchor_on ?? startsOn}
              {service.ends_on ? ` hasta ${service.ends_on}` : ''} · {service.duration_minutes} min
            </p>
            <p className="whitespace-pre-wrap">{service.tasks}</p>
            {service.weekdays.map((day) => (
              <p key={day}>
                <strong>{days[day - 1]}: </strong>
                {service.weekly_tasks[String(day)] || service.tasks}
              </p>
            ))}
            <p className="whitespace-pre-wrap">{service.instructions}</p>
          </div>
          {service.modality === 'fixed' ? (
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
        </article>
      ))}
      {editable ? (
        <Button variant="outline" onPress={() => setOpen(true)}>
          Añadir servicio
        </Button>
      ) : null}
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Añadir servicio"
        submitLabel="Guardar servicio"
        onSubmit={() => void save()}
        isSubmitting={busy}
        isDirty={Boolean(form.title)}
        submitDisabled={
          !form.title.trim() ||
          !form.location_id ||
          !form.anchor_on ||
          !form.frequency ||
          !form.duration_minutes ||
          ((form.frequency === 'weekly' || form.frequency === 'fortnightly') &&
            form.weekdays.length === 0)
        }
      >
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
          onChange={(v) => set('modality', v as CleaningService['modality'])}
        />
        <SelectField
          label="Frecuencia"
          value={form.frequency ?? 'weekly'}
          options={Object.entries(frequencyLabels).map(([value, label]) => ({ value, label }))}
          onChange={(v) => set('frequency', v as CleaningService['frequency'])}
        />
        <TextField
          label="Inicio y fecha de referencia · obligatorio"
          type="date"
          value={form.anchor_on ?? ''}
          onChange={(v) => set('anchor_on', v)}
          placeholder="Fecha"
        />
        <TextField
          label="Fin opcional"
          type="date"
          value={form.ends_on ?? ''}
          onChange={(v) => set('ends_on', v || null)}
          placeholder="Sin fin"
        />
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
        <SelectField
          label="Persona habitual"
          value={form.assigned_user_id ?? ''}
          options={[
            { value: '', label: 'Sin asignar' },
            ...(people.data ?? []).map((p) => ({ value: p.id, label: p.label })),
          ]}
          onChange={(v) => set('assigned_user_id', v || null)}
        />
        <SelectField
          label="Equipo habitual"
          value={form.work_team_id ?? ''}
          options={[
            { value: '', label: 'Sin asignar' },
            ...(teams.data ?? [])
              .filter((t) => !t.archived)
              .map((t) => ({ value: t.id, label: t.name })),
          ]}
          onChange={(v) => set('work_team_id', v || null)}
        />
        <TextareaField
          label="Tareas y alcance"
          value={form.tasks}
          onChange={(v) => set('tasks', v)}
          maxLength={10000}
          placeholder="Qué hay que limpiar"
        />
        {form.frequency === 'weekly' || form.frequency === 'fortnightly' ? (
          <fieldset className="space-y-2 sm:col-span-2">
            <legend>Días y tareas específicas</legend>
            {days.map((label, index) => {
              const day = index + 1
              return (
                <div key={day} className="flex items-center gap-3">
                  <label>
                    <input
                      type="checkbox"
                      checked={form.weekdays.includes(day)}
                      onChange={(e) =>
                        set(
                          'weekdays',
                          e.target.checked
                            ? [...form.weekdays, day].sort((a, b) => a - b)
                            : form.weekdays.filter((d) => d !== day),
                        )
                      }
                    />{' '}
                    {label}
                  </label>
                  {form.weekdays.includes(day) ? (
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
          label="Acceso, contacto, material, maquinaria y observaciones"
          value={form.instructions}
          onChange={(v) => set('instructions', v)}
          maxLength={5000}
          placeholder="Incluye si es necesario colocar carteles en el garaje"
        />
        <label>
          <input
            type="checkbox"
            checked={form.requires_acceptance}
            onChange={(e) => set('requires_acceptance', e.target.checked)}
          />{' '}
          Requiere conformidad del cliente
        </label>
      </FormDialog>
    </section>
  )
}
