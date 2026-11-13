import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { teamQuery } from '@/features/settings/application/team-actions'
import { SelectField, TextareaField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  listAbsenceHistory,
  saveAdministrativeAbsence,
  type AdministrativeAbsence,
} from '../application/vacation-actions'
import type { AbsenceCalendarProposal } from '../domain/absence-events'
import { overlappingEmployeeAbsences } from '../domain/absence-occupancy'
import {
  absenceTypes,
  absenceTypeLabels,
  isValidAbsencePeriod,
  vacationRequestStatusLabels,
  type VacationRequest,
} from '../domain/vacation-request'

export function AdminAbsenceForm({
  tenantId,
  request,
  requests,
  onDone,
  proposal,
  memberIds,
}: {
  tenantId: string
  request: VacationRequest | null
  requests: VacationRequest[]
  onDone: () => void
  proposal?: AbsenceCalendarProposal | undefined
  memberIds?: string[] | undefined
}) {
  const cache = useQueryClient()
  const people = useQuery(teamQuery(tenantId))
  const [form, setForm] = useState<AdministrativeAbsence>({
    requester_id: request?.requesterId ?? (memberIds?.length === 1 ? (memberIds[0] ?? '') : ''),
    start_date: proposal?.startDate ?? request?.startDate ?? '',
    end_date: proposal ? proposal.endDate : (request?.endDate ?? ''),
    absence_type: request?.absenceType ?? 'vacation',
    status: request?.status ?? 'pending',
    comment: request?.comment ?? '',
    decision_comment: proposal ? '' : (request?.decisionComment ?? ''),
  })
  const [busy, setBusy] = useState(false)
  const operations = useRef(new Map<string, string>())
  function set<K extends keyof AdministrativeAbsence>(key: K, value: AdministrativeAbsence[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }
  const overlaps = overlappingEmployeeAbsences(
    requests,
    form.requester_id,
    form.start_date,
    form.end_date,
    request?.id,
  )
  async function save() {
    if (
      busy ||
      !form.requester_id ||
      (memberIds && !memberIds.includes(form.requester_id)) ||
      !isValidAbsencePeriod(form.start_date, form.end_date ?? '') ||
      (proposal && !form.decision_comment.trim())
    )
      return
    const key = JSON.stringify(form)
    const operation = operations.current.get(key) ?? crypto.randomUUID()
    operations.current.set(key, operation)
    setBusy(true)
    try {
      await saveAdministrativeAbsence(
        tenantId,
        request,
        { ...form, end_date: form.end_date || null },
        operation,
      )
      await Promise.all(
        [
          'vacation-requests',
          'staff-absences',
          'approved-vacations',
          'vacation-coverage',
          'absence-history',
          'vacation-decision-notifications',
        ].map((key) => cache.invalidateQueries({ queryKey: [key, tenantId] })),
      )
      toast.success('Periodo guardado')
      onDone()
    } catch (error) {
      toast.error('No se pudo guardar', {
        description: error instanceof Error ? error.message : 'Reintenta.',
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onDone()
      }}
      title={request ? 'Editar o cancelar periodo' : 'Registrar ausencia para un empleado'}
      submitLabel="Guardar periodo"
      isSubmitting={busy}
      isDirty
      submitDisabled={
        !form.requester_id ||
        Boolean(memberIds && !memberIds.includes(form.requester_id)) ||
        !isValidAbsencePeriod(form.start_date, form.end_date ?? '') ||
        Boolean(proposal && !form.decision_comment.trim())
      }
      onSubmit={() => void save()}
    >
      {proposal ? (
        <p className="text-muted-foreground sm:col-span-2">
          Cambio propuesto desde el calendario, pendiente de guardar. Revisa las fechas y explica el
          motivo en la anotación de administración.
        </p>
      ) : null}
      {request ? (
        <p>Empleado: {request.requesterName}</p>
      ) : (
        <SelectField
          label="Empleado · obligatorio"
          value={form.requester_id}
          onChange={(v) => set('requester_id', v)}
          options={[
            { value: '', label: 'Selecciona un empleado' },
            ...(people.data ?? [])
              .filter((p) => !memberIds || memberIds.includes(p.userId))
              .map((p) => ({ value: p.userId, label: p.fullName || p.email })),
          ]}
        />
      )}
      <SelectField
        label="Tipo"
        value={form.absence_type}
        onChange={(v) => set('absence_type', v as AdministrativeAbsence['absence_type'])}
        options={absenceTypes.map((value) => ({ value, label: absenceTypeLabels[value] }))}
      />
      <TextField
        label="Inicio · obligatorio"
        type="date"
        value={form.start_date}
        onChange={(v) => set('start_date', v)}
        placeholder="Inicio"
      />
      <TextField
        label="Fin inclusivo"
        type="date"
        value={form.end_date ?? ''}
        onChange={(v) => set('end_date', v)}
        placeholder="Sin fecha de fin confirmada"
      />
      <SelectField
        label="Estado"
        value={form.status}
        onChange={(v) => set('status', v as AdministrativeAbsence['status'])}
        options={(
          [
            'pending',
            'approved',
            'rejected',
            'canceled',
            ...(request?.status === 'needs_info' ? ['needs_info' as const] : []),
          ] as const
        ).map((value) => ({ value, label: vacationRequestStatusLabels[value] }))}
      />
      <TextareaField
        label="Observaciones y particularidades"
        value={form.comment}
        onChange={(v) => set('comment', v)}
        maxLength={1000}
        placeholder="Jornada, condiciones particulares, calendario escolar o fijo discontinuo. No se deduce consumo de vacaciones."
      />
      <TextareaField
        label="Motivo o anotación de administración"
        value={form.decision_comment}
        onChange={(v) => set('decision_comment', v)}
        maxLength={1000}
        placeholder="Decisión o motivo de cambio"
      />
      {overlaps.length ? (
        <output className="text-warning sm:col-span-2">
          Atención: ya hay {overlaps.length} periodos activos de este empleado que se solapan.
          Revisa las fechas; no se duplica el recuento de personas.
        </output>
      ) : null}
      {people.isError ? (
        <p role="alert">
          No se pudieron cargar los empleados.{' '}
          <Button variant="outline" onPress={() => void people.refetch()}>
            Reintentar
          </Button>
        </p>
      ) : null}
    </FormDialog>
  )
}

export function AbsenceHistory({ tenantId, requestId }: { tenantId: string; requestId: string }) {
  const history = useQuery({
    queryKey: ['absence-history', tenantId, requestId],
    queryFn: () => listAbsenceHistory(tenantId, requestId),
  })
  if (history.isPending) return <output>Cargando historial…</output>
  if (history.isError) return <p role="alert">No se pudo cargar el historial.</p>
  return (
    <ol className="space-y-2">
      {history.data.map((event) => (
        <li key={event.id} className="rounded border p-2">
          <p>
            {new Date(event.occurred_at).toLocaleString('es-ES')} · {event.actor_id ?? 'Sistema'}
          </p>
          {[event.before_state, event.after_state].map((state, index) => (
            <div key={index}>
              <p>
                {index === 0 ? 'Antes' : 'Después'}:{' '}
                {state
                  ? `${state.requester_name} · ${state.start_date} — ${state.end_date ?? 'Sin fin'} · ${absenceTypeLabels[state.absence_type]} · ${vacationRequestStatusLabels[state.status]}`
                  : 'Nuevo registro'}
              </p>
              {state ? (
                <p className="whitespace-pre-wrap">
                  {state.requester_comment} {state.decision_comment}
                </p>
              ) : null}
            </div>
          ))}
        </li>
      ))}
    </ol>
  )
}
