import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { RelatedCreateButton, useRelatedRecordCreation } from '@/features/clients/ui/related-record-creation'
import { listTechnicians } from '@/features/visits/application/visit-actions'
import { loadWorkTargetOptions } from '@/features/work-orders/application/work-order-actions'
import { workTeamsQuery } from '@/features/work-teams/application/work-team-actions'
import { printDocument } from '@/shared/lib/print-document'
import { SelectField, TextareaField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  saveContractJob,
  listCleaningServices,
  type CleaningService,
} from '../application/cleaning-service-actions'
import { contractJobError, emptyContractJob, jobFrequencyLabels, normalizeContractJob, type ContractJobDraft } from '../domain/contract-job'

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export const frequencyLabels = jobFrequencyLabels

export function CleaningServicesPanel({
  tenantId,
  contractId,
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
    tenantId, clientId, onLocationCreated: (id) => set('location_id', id),
  })
  const operation = useRef(new Map<string, string>())
  const sheets = useRef(new Map<string, HTMLElement>())
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }
  const error = contractJobError(form, startsOn, endsOn)
  function edit(service: CleaningService) {
    const initial = emptyContractJob(startsOn)
    const values = Object.fromEntries(Object.keys(initial).map((key) => [key, service[key as keyof ContractJobDraft]])) as ContractJobDraft
    setForm(service.configured ? { ...values, local_start: service.time_known ? values.local_start.slice(0, 5) : '' }
      : { ...initial, title: service.title, tasks: service.tasks })
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
      await saveContractJob({ tenantId, contractId, jobId: editingId, expectedUpdatedAt: updatedAt, service, operationId: id })
      await cache.invalidateQueries({ queryKey: ['cleaning-services', tenantId, contractId] })
      await cache.invalidateQueries({ queryKey: ['service-contract', tenantId, contractId] })
      await cache.invalidateQueries({ queryKey: ['service-contracts', tenantId] })
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
    <section className="space-y-4 rounded-lg border p-4" aria-label="Trabajos del contrato">
      <h2 className="text-lg font-semibold">Trabajos contratados</h2>
      <p className="text-muted-foreground text-sm">
        Cada partida aceptada es un trabajo. Configura qué hacer, dónde y si se realiza una vez o periódicamente.
        La hoja permanente del centro no genera partes diarios; las visitas móviles generan órdenes individuales.
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
      {services.data?.length === 0 ? <p>Aún no hay trabajos configurados.</p> : null}
      {services.data?.map((service) => (
        <article key={service.id} className="space-y-2 border-b pb-4">
          {!service.configured ? (
            <div><h3 className="font-semibold">{service.title}</h3><p>Pendiente de configurar · alcance aceptado: {service.tasks}</p></div>
          ) : <div
            ref={(node) => {
              if (node) sheets.current.set(service.id, node)
              else sheets.current.delete(service.id)
            }}
            className="paper-sheet space-y-3"
          >
            <h3 className="font-semibold">
              {service.modality === 'fixed' ? 'Hoja permanente del centro' : service.frequency === 'once' ? 'Trabajo puntual' : 'Trabajo periódico móvil'} ·{' '}
              {service.title}
            </h3>
            <p>
              {clientName} ·{' '}
              {service.location?.name ??
                targets.data?.locations.find((l) => l.id === service.location_id)?.name}{' '}
              ·{' '}
              {service.location?.address ??
                targets.data?.locations.find((l) => l.id === service.location_id)?.address}
            </p>
            <p className="whitespace-pre-wrap">{service.location?.operational_contact}</p>
            <p className="whitespace-pre-wrap">{service.location?.access_notes}</p>
            <p className="whitespace-pre-wrap">{service.location?.notes}</p>
            <p>
              {service.time_known
                ? `Hora prevista: ${service.local_start.slice(0, 5)}`
                : 'Sin horario fijo'}{' '}
              ·{' '}
              {teams.data?.find((t) => t.id === service.work_team_id)?.name ||
                people.data?.find((p) => p.id === service.assigned_user_id)?.label ||
                'Sin asignar'}
            </p>
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
            <p className="whitespace-pre-wrap">Material: {service.materials || 'Sin especificar'}</p>
            <p>Conformidad del cliente: {service.requires_acceptance ? 'Sí, al finalizar' : 'No requerida'}</p>
          </div>}
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
          {editable && (draft || !service.configured) ? (
            <Button variant="outline" onPress={() => edit(service)}>
              {service.configured ? 'Editar trabajo' : 'Configurar trabajo'}
            </Button>
          ) : null}
        </article>
      ))}
      {editable ? (
        <Button variant="outline" onPress={() => { setForm(emptyContractJob(startsOn)); setEditingId(null); setOpen(true) }}>
          Añadir trabajo
        </Button>
      ) : null}
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editingId ? 'Configurar trabajo contratado' : 'Añadir trabajo'}
        submitLabel="Guardar trabajo"
        onSubmit={() => void save()}
        isSubmitting={busy}
        isDirty={Boolean(form.title)}
        submitDisabled={Boolean(error) || related.pending || !targets.isSuccess || !targets.data.locations.some((l) => l.id === form.location_id)}
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
        {related.allowed ? <RelatedCreateButton label="Crear centro" disabled={busy || related.pending} onPress={() => related.start('location')} /> : null}
        {targets.isError ? <p role="alert">No se pudieron cargar los centros. <Button variant="outline" onPress={() => void targets.refetch()}>Reintentar</Button></p> : null}
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
          onChange={(v) => setForm((current) => ({ ...current, frequency: v as ContractJobDraft['frequency'], modality: v === 'once' ? 'mobile' : current.modality }))}
        />
        <TextField
          label={form.frequency === 'once' ? 'Fecha prevista · obligatorio' : 'Inicio y fecha de referencia · obligatorio'}
          type="date"
          value={form.anchor_on ?? ''}
          onChange={(v) => set('anchor_on', v)}
          placeholder="Fecha"
        />
        {form.frequency !== 'once' ? <TextField
          label="Fin opcional"
          type="date"
          value={form.ends_on ?? ''}
          onChange={(v) => set('ends_on', v || null)}
          placeholder="Sin fin"
        /> : null}
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
          onChange={(v) => setForm((current) => ({ ...current, assigned_user_id: v || null, work_team_id: v ? null : current.work_team_id }))}
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
          onChange={(v) => setForm((current) => ({ ...current, work_team_id: v || null, assigned_user_id: v ? null : current.assigned_user_id }))}
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
        <TextareaField label="Material y maquinaria" value={form.materials} onChange={(v) => set('materials', v)} maxLength={2000} placeholder="Quién aporta los productos, útiles y maquinaria" />
        <TextareaField
          label="Instrucciones de acceso y observaciones"
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
        {error ? <p className="text-muted-foreground text-sm">{error}</p> : null}
        <p className="text-muted-foreground text-sm sm:col-span-2">
          {form.modality === 'fixed' ? 'Genera una hoja permanente para dejar en el centro y facilitar sustituciones.' : 'Genera una orden por fecha prevista. Cada cambio de fecha conserva la referencia original, el motivo y el historial.'}
          {' '}La frecuencia del trabajo es independiente del periodo de facturación.
        </p>
      </FormDialog>
      {related.dialogs}
    </section>
  )
}
