import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { listTechnicians } from '@/features/visits/application/visit-actions'
import { SelectField, TextareaField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import { listAbsenceHistory, saveAdministrativeAbsence, type AdministrativeAbsence } from '../application/vacation-actions'
import { overlappingEmployeeAbsences } from '../domain/absence-occupancy'
import { absenceTypes, absenceTypeLabels, isValidAbsencePeriod, vacationRequestStatusLabels, type VacationRequest } from '../domain/vacation-request'

export function AdminAbsenceForm({ tenantId, request, requests, onDone }: { tenantId: string; request: VacationRequest | null; requests: VacationRequest[]; onDone: () => void }) {
  const cache = useQueryClient()
  const people = useQuery({ queryKey: ['technicians', tenantId], queryFn: () => listTechnicians(tenantId) })
  const [form, setForm] = useState<AdministrativeAbsence>({ requester_id: request?.requesterId ?? '', start_date: request?.startDate ?? '', end_date: request?.endDate ?? '', absence_type: request?.absenceType ?? 'vacation', status: request?.status ?? 'pending', comment: request?.comment ?? '', decision_comment: request?.decisionComment ?? '' })
  const [busy, setBusy] = useState(false)
  const operations = useRef(new Map<string, string>())
  function set<K extends keyof AdministrativeAbsence>(key: K, value: AdministrativeAbsence[K]) { setForm(current => ({ ...current, [key]: value })) }
  const overlaps = overlappingEmployeeAbsences(requests, form.requester_id, form.start_date, form.end_date, request?.id)
  async function save() {
    if (busy || !form.requester_id || !isValidAbsencePeriod(form.start_date, form.end_date ?? '')) return
    const key = JSON.stringify(form)
    const operation = operations.current.get(key) ?? crypto.randomUUID()
    operations.current.set(key, operation)
    setBusy(true)
    try { await saveAdministrativeAbsence(tenantId, request, { ...form, end_date: form.end_date || null }, operation); await Promise.all(['vacation-requests', 'approved-vacations', 'vacation-coverage', 'absence-history', 'vacation-decision-notifications'].map(key => cache.invalidateQueries({ queryKey: [key, tenantId] }))); toast.success('Periodo guardado'); onDone() }
    catch (error) { toast.error('No se pudo guardar', { description: error instanceof Error ? error.message : 'Reintenta.' }) }
    finally { setBusy(false) }
  }
  return <FormDialog open onOpenChange={open => { if (!open) onDone() }} title={request ? 'Editar o cancelar periodo' : 'Registrar ausencia para un empleado'} submitLabel="Guardar periodo" isSubmitting={busy} isDirty submitDisabled={!form.requester_id || !isValidAbsencePeriod(form.start_date, form.end_date ?? '')} onSubmit={() => void save()}>
    <SelectField label="Empleado · obligatorio" value={form.requester_id} onChange={v => set('requester_id', v)} options={[{ value: '', label: 'Selecciona un empleado' }, ...(people.data ?? []).map(p => ({ value: p.id, label: p.label })), ...(request && !people.data?.some(p => p.id === request.requesterId) ? [{ value: request.requesterId, label: request.requesterName }] : [])]} />
    <SelectField label="Tipo" value={form.absence_type} onChange={v => set('absence_type', v as AdministrativeAbsence['absence_type'])} options={absenceTypes.map(value => ({ value, label: absenceTypeLabels[value] }))} />
    <TextField label="Inicio · obligatorio" type="date" value={form.start_date} onChange={v => set('start_date', v)} placeholder="Inicio" />
    <TextField label="Fin inclusivo" type="date" value={form.end_date ?? ''} onChange={v => set('end_date', v)} placeholder="Sin fecha de fin confirmada" />
    <SelectField label="Estado" value={form.status} onChange={v => set('status', v as AdministrativeAbsence['status'])} options={(['pending', 'approved', 'rejected', 'canceled', ...(request?.status === 'needs_info' ? ['needs_info' as const] : [])] as const).map(value => ({ value, label: vacationRequestStatusLabels[value] }))} />
    <TextareaField label="Observaciones y particularidades" value={form.comment} onChange={v => set('comment', v)} maxLength={1000} placeholder="Jornada, condiciones particulares, calendario escolar o fijo discontinuo. No se deduce consumo de vacaciones." />
    <TextareaField label="Motivo o anotación de administración" value={form.decision_comment} onChange={v => set('decision_comment', v)} maxLength={1000} placeholder="Decisión o motivo de cambio" />
    {overlaps.length ? <output className="text-warning sm:col-span-2">Atención: ya hay {overlaps.length} periodos activos de este empleado que se solapan. Revisa las fechas; no se duplica el recuento de personas.</output> : null}
    {people.isError ? <p role="alert">No se pudieron cargar los empleados. <Button variant="outline" onPress={() => void people.refetch()}>Reintentar</Button></p> : null}
  </FormDialog>
}

export function AbsenceHistory({ tenantId, requestId }: { tenantId: string; requestId: string }) {
  const history = useQuery({ queryKey: ['absence-history', tenantId, requestId], queryFn: () => listAbsenceHistory(tenantId, requestId) })
  if (history.isPending) return <output>Cargando historial…</output>
  if (history.isError) return <p role="alert">No se pudo cargar el historial.</p>
  return <ol className="space-y-2">{history.data.map(event => <li key={event.id} className="rounded border p-2"><p>{new Date(event.occurred_at).toLocaleString('es-ES')} · {event.actor_id}</p><p>Antes: {event.before_state ? `${event.before_state.start_date} — ${event.before_state.end_date ?? 'Sin fin'} · ${event.before_state.status}` : 'Nuevo registro'}</p><p>Después: {String(event.after_state.start_date)} — {String(event.after_state.end_date ?? 'Sin fin')} · {String(event.after_state.status)}</p><p>{String(event.after_state.decision_comment ?? '')}</p></li>)}</ol>
}