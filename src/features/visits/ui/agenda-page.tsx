import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { PlusIcon } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { useSession } from '@/features/auth'
import { RelatedCreateButton, useRelatedRecordCreation } from '@/features/clients/ui/related-record-creation'
import { loadWorkTargetOptions } from '@/features/work-orders/application/work-order-actions'
import { useTenantData } from '@/shared/store/store'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  createServiceVisit,
  listOfficeVisits,
  listTechnicians,
  type VisitPriority,
  type VisitSummary,
} from '../application/visit-actions'
import { VisitReplanForm } from './visit-replan-form'
import { VisitReportEditor } from './visit-report-editor'

const todayInMadrid = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

const statusLabels = {
  scheduled: 'Planificada',
  in_progress: 'En curso',
  completed: 'Completada',
  skipped: 'Omitida',
  canceled: 'Cancelada',
}

export function AgendaPage() {
  const { tenant, clients } = useTenantData()
  const session = useSession()
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayInMadrid)
  const [view, setView] = useState<'day' | 'week'>('day')
  const [filterTechnicianId, setFilterTechnicianId] = useState('')
  const [page, setPage] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [initialLocalStart, setInitialLocalStart] = useState(() => `${todayInMadrid()}T09:00`)
  const [clientId, setClientId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [title, setTitle] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [localStart, setLocalStart] = useState(initialLocalStart)
  const [duration, setDuration] = useState('60')
  const [priority, setPriority] = useState<VisitPriority>('normal')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [replanning, setReplanning] = useState<VisitSummary | null>(null)
  const [openReportId, setOpenReportId] = useState<string | null>(null)
  const operations = useRef(new Map<string, string>())
  const related = useRelatedRecordCreation({
    tenantId: tenant.id,
    clientId,
    locationId,
    onClientCreated: (id) => {
      setClientId(id)
      setLocationId('')
      setAssetId('')
    },
    onLocationCreated: (id) => {
      setLocationId(id)
      setAssetId('')
    },
    onPoolCreated: setAssetId,
  })
  const to = view === 'week' ? addDays(date, 6) : date
  const queryKey = ['office-visits', tenant.id, date, to, filterTechnicianId, page]
  const visits = useQuery({
    queryKey,
    queryFn: () => listOfficeVisits(tenant.id, date, to, filterTechnicianId || null, page),
  })
  const technicians = useQuery({
    queryKey: ['technicians', tenant.id],
    queryFn: () => listTechnicians(tenant.id),
  })
  const targets = useQuery({
    queryKey: ['work-target-options', tenant.id, clientId],
    enabled: Boolean(clientId) && !related.pending,
    queryFn: () => loadWorkTargetOptions(tenant.id, clientId),
  })
  const selectedLocation = targets.data?.locations.find((location) => location.id === locationId)
  const timezone = selectedLocation?.timezone ?? 'Europe/Madrid'
  const durationMinutes = Number(duration)
  const validForm =
    Boolean(clientId) &&
    title.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localStart) &&
    Number.isInteger(durationMinutes) &&
    durationMinutes >= 15 &&
    durationMinutes <= 720
  const isDirty = Boolean(
    clientId ||
    locationId ||
    assetId ||
    title ||
    assignedUserId ||
    localStart !== initialLocalStart ||
    duration !== '60' ||
    priority !== 'normal' ||
    notes,
  )

  function resetCreateForm() {
    const nextLocalStart = `${todayInMadrid()}T09:00`
    setInitialLocalStart(nextLocalStart)
    setClientId('')
    setLocationId('')
    setAssetId('')
    setTitle('')
    setAssignedUserId('')
    setLocalStart(nextLocalStart)
    setDuration('60')
    setPriority('normal')
    setNotes('')
  }

  async function createVisit() {
    if (busy || related.pending || !validForm) return
    const payload = {
      tenantId: tenant.id,
      clientId,
      locationId: locationId || null,
      assetId: assetId || null,
      workOrderId: null,
      title: title.trim(),
      assignedUserId: assignedUserId || null,
      localStart,
      timezone,
      durationMinutes,
      priority,
      notes: notes.trim(),
    }
    const key = JSON.stringify(payload)
    let operationId = operations.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operations.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await createServiceVisit({ ...payload, operationId })
      operations.current.delete(key)
      setPage(0)
      await queryClient.invalidateQueries({ queryKey: ['office-visits', tenant.id] })
      resetCreateForm()
      setCreateOpen(false)
      toast.success('Visita planificada')
    } catch (error) {
      toast.error('No se pudo planificar la visita', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Agenda de visitas</h1>
          <p className="text-muted-foreground text-sm">
            Planifica una jornada y consulta las visitas por día, semana o técnico.
          </p>
        </div>
        <Button onPress={() => setCreateOpen(true)}>
          <PlusIcon aria-hidden="true" />
          Nueva visita
        </Button>
      </div>
      <FormDialog
        open={createOpen && !related.creating}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) resetCreateForm()
        }}
        title="Nueva visita"
        submitLabel={busy ? 'Guardando…' : 'Planificar visita'}
        submitDisabled={related.pending || !validForm || !session?.tenantId}
        isSubmitting={busy}
        isDirty={isDirty}
        onSubmit={() => void createVisit()}
      >
        {related.status}
        <div className="flex flex-col gap-1.5">
        <SelectField
          label="Cliente"
          value={clientId}
          options={[
            { value: '', label: 'Selecciona un cliente' },
            ...clients.map((client) => ({ value: client.id, label: client.name })),
          ]}
          onChange={(value) => {
            setClientId(value)
            setLocationId('')
            setAssetId('')
          }}
        />
        {related.allowed ? <RelatedCreateButton label="Crear cliente" onPress={() => related.start('client')} /> : null}
        </div>
        <div className="flex flex-col gap-1.5">
        <SelectField
          label="Ubicación"
          value={locationId}
          options={[
            { value: '', label: 'Sin ubicación' },
            ...(targets.data?.locations ?? []).map((location) => ({
              value: location.id,
              label: location.name,
            })),
          ]}
          onChange={(value) => {
            setLocationId(value)
            setAssetId('')
          }}
        />
        {related.allowed && clientId ? <RelatedCreateButton label="Crear ubicación" disabled={related.pending} onPress={() => related.start('location')} /> : null}
        </div>
        <div className="flex flex-col gap-1.5">
        <SelectField
          label="Activo"
          value={assetId}
          options={[
            { value: '', label: 'Sin activo' },
            ...(targets.data?.assets ?? [])
              .filter((asset) => asset.location_id === locationId)
              .map((asset) => ({ value: asset.id, label: asset.name })),
          ]}
          onChange={setAssetId}
        />
        {related.allowed && locationId ? <RelatedCreateButton label="Crear piscina" disabled={related.pending} onPress={() => related.start('pool')} /> : null}
        </div>
        <SelectField
          label="Técnico"
          value={assignedUserId}
          options={[
            { value: '', label: 'Pendiente de asignar' },
            ...(technicians.data ?? []).map((person) => ({
              value: person.id,
              label: person.label,
            })),
          ]}
          onChange={setAssignedUserId}
        />
        <TextField
          label="Asunto"
          value={title}
          onChange={setTitle}
          placeholder="Ejemplo: revisión de piscina"
          maxLength={200}
          className="sm:col-span-2"
        />
        <TextField
          label="Inicio local"
          type="datetime-local"
          value={localStart}
          onChange={setLocalStart}
          placeholder="Fecha y hora"
          helper={`Zona horaria: ${timezone}`}
        />
        <SelectField
          label="Duración"
          value={duration}
          options={[
            { value: '30', label: '30 minutos' },
            { value: '60', label: '1 hora' },
            { value: '90', label: '1 hora y media' },
            { value: '120', label: '2 horas' },
          ]}
          onChange={setDuration}
        />
        <SelectField
          label="Prioridad"
          value={priority}
          options={[
            { value: 'low', label: 'Baja' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'Alta' },
            { value: 'urgent', label: 'Urgente' },
          ]}
          onChange={(value) => setPriority(value as VisitPriority)}
        />
        <TextField
          label="Indicaciones"
          value={notes}
          onChange={setNotes}
          placeholder="Instrucciones necesarias para la visita"
          maxLength={2000}
          className="sm:col-span-2"
        />
      </FormDialog>
      {related.dialogs}

      <Card>
        <CardHeader>
          <CardTitle>Visitas planificadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label="Desde"
              type="date"
              value={date}
              onChange={(value) => {
                if (value) {
                  setDate(value)
                  setPage(0)
                }
              }}
              placeholder="Fecha"
            />
            <SelectField
              label="Vista"
              value={view}
              options={[
                { value: 'day', label: 'Día' },
                { value: 'week', label: 'Semana' },
              ]}
              onChange={(value) => {
                setView(value as 'day' | 'week')
                setPage(0)
              }}
            />
            <SelectField
              label="Técnico"
              value={filterTechnicianId}
              options={[
                { value: '', label: 'Todos' },
                ...(technicians.data ?? []).map((person) => ({
                  value: person.id,
                  label: person.label,
                })),
              ]}
              onChange={(value) => {
                setFilterTechnicianId(value)
                setPage(0)
              }}
            />
          </div>
          {visits.isPending ? <output>Cargando agenda…</output> : null}
          {visits.isError ? (
            <p role="alert" className="text-destructive text-sm">
              No se pudo cargar la agenda: {visits.error.message}
            </p>
          ) : null}
          {visits.data?.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay visitas en este periodo.</p>
          ) : null}
          <ol className="divide-border divide-y">
            {visits.data?.map((visit) => (
              <li key={visit.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">{visit.title}</p>
                  <p className="text-muted-foreground">
                    {new Date(visit.scheduled_start_at).toLocaleString('es-ES', {
                      timeZone: visit.timezone,
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}{' '}
                    ({visit.timezone}) · {visit.client_name}
                    {visit.location_name ? ` · ${visit.location_name}` : ''}
                  </p>
                  <p>{visit.assigned_user_name || 'Pendiente de asignar'}</p>
                </div>
                <div className="space-y-2 text-right">
                  <p>
                    {statusLabels[visit.status]}
                    {visit.priority === 'urgent' ? ' · Urgente' : ''}
                  </p>
                  {visit.status === 'scheduled' ? (
                    <Button variant="outline" onPress={() => setReplanning(visit)}>
                      Reprogramar
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    onPress={() => setOpenReportId(openReportId === visit.id ? null : visit.id)}
                  >
                    {openReportId === visit.id ? 'Ocultar parte' : 'Ver parte'}
                  </Button>
                </div>
                {replanning?.id === visit.id ? (
                  <VisitReplanForm
                    key={`${visit.id}:${visit.updated_at}`}
                    tenantId={tenant.id}
                    visit={visit}
                    technicians={technicians.data ?? []}
                    onDone={async () => {
                      setReplanning(null)
                      await queryClient.invalidateQueries({
                        queryKey: ['office-visits', tenant.id],
                      })
                    }}
                    onCancel={() => setReplanning(null)}
                  />
                ) : null}
                {openReportId === visit.id && session?.userId ? (
                  <div className="w-full">
                    <VisitReportEditor
                      key={`${session.userId}:${tenant.id}:${visit.id}`}
                      visit={visit}
                      tenantId={tenant.id}
                      userId={session.userId}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between text-sm">
            <span>Página {page + 1}</span>
            <div className="flex gap-2">
              <Button variant="outline" isDisabled={page === 0} onPress={() => setPage(page - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                isDisabled={(visits.data?.length ?? 0) < 50}
                onPress={() => setPage(page + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
