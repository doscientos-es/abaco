import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useSession } from '@/features/auth'
import { VisitFieldEntriesPanel } from '@/features/field-entries/ui/visit-field-entries-panel'
import { IncidentPanel } from '@/features/incidents/ui/incident-panel'
import { VisitMeasurementsPanel } from '@/features/measurements/ui/visit-measurements-panel'
import { TextareaField } from '@/shared/ui/form'

import type { VisitSummary } from '../application/visit-actions'
import {
  loadVisitReport,
  saveVisitReport,
  type VisitReportData,
} from '../application/visit-report-actions'
import {
  readVisitReportLocalDraft,
  removeVisitReportLocalDraft,
  visitReportDraftKey,
  writeVisitReportLocalDraft,
  type LocalVisitReportDraft,
} from '../application/visit-report-local-draft'
import { ClosedVisitReport } from './closed-visit-report'
import { VisitPhotosPanel } from './visit-photos-panel'
import { VisitReportShares } from './visit-report-shares'

const emptyData = (): VisitReportData => ({
  notes: '',
  checklist: [],
  recommendations: '',
  next_actions: '',
})

export function VisitReportEditor({
  visit,
  tenantId,
  userId,
}: {
  visit: VisitSummary
  tenantId: string
  userId: string
}) {
  const queryClient = useQueryClient()
  const session = useSession()
  const key = visitReportDraftKey(userId, tenantId, visit.id)
  const queryKey = ['visit-report', tenantId, visit.id]
  const report = useQuery({ queryKey, queryFn: () => loadVisitReport(tenantId, visit.id) })
  const [draft, setDraft] = useState<LocalVisitReportDraft | null>(() =>
    readVisitReportLocalDraft(key),
  )
  const [busy, setBusy] = useState(false)
  const [localStorageFailed, setLocalStorageFailed] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const closed = !['scheduled', 'in_progress'].includes(visit.status)
  const data = draft?.data ?? report.data?.data ?? emptyData()
  const serverRevision = report.data?.revision ?? 0
  const conflict = report.isSuccess && draft !== null && draft.baseRevision !== serverRevision
  const changed = Boolean(
    draft && JSON.stringify(draft.data) !== JSON.stringify(report.data?.data ?? emptyData()),
  )

  function change(next: VisitReportData) {
    if (busy || closed) return
    const updated: LocalVisitReportDraft = {
      baseRevision: draft?.baseRevision ?? serverRevision,
      data: next,
      operationId: crypto.randomUUID(),
    }
    setDraft(updated)
    setLocalStorageFailed(!writeVisitReportLocalDraft(key, updated))
  }

  function useServerVersion() {
    if (!report.isSuccess || busy) return
    removeVisitReportLocalDraft(key)
    setDraft({
      baseRevision: serverRevision,
      data: report.data?.data ?? emptyData(),
      operationId: crypto.randomUUID(),
    })
  }

  function keepLocalVersion() {
    if (!draft || !report.isSuccess || busy) return
    const updated = { ...draft, baseRevision: serverRevision, operationId: crypto.randomUUID() }
    setDraft(updated)
    setLocalStorageFailed(!writeVisitReportLocalDraft(key, updated))
  }

  async function save() {
    if (busy || !draft || conflict || closed) return
    setBusy(true)
    try {
      const revision = await saveVisitReport({
        tenantId,
        visitId: visit.id,
        expectedRevision: draft.baseRevision,
        data: draft.data,
        operationId: draft.operationId,
      })
      removeVisitReportLocalDraft(key)
      setDraft({ ...draft, baseRevision: revision, operationId: crypto.randomUUID() })
      await queryClient.invalidateQueries({ queryKey })
      toast.success('Parte guardado en la empresa')
    } catch (error) {
      const fresh = await report.refetch()
      if (fresh.data && JSON.stringify(fresh.data.data) === JSON.stringify(draft.data)) {
        removeVisitReportLocalDraft(key)
        setDraft({ ...draft, baseRevision: fresh.data.revision, operationId: crypto.randomUUID() })
        toast.success('Guardado confirmado')
      } else {
        toast.error('No se pudo guardar el parte', {
          description:
            error instanceof Error ? error.message : 'El borrador sigue en este dispositivo.',
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parte de visita</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {visit.status === 'completed' ? (
          <ClosedVisitReport tenantId={tenantId} visitId={visit.id} />
        ) : null}
        {report.isPending && !draft ? <p className="text-sm">Cargando parte…</p> : null}
        {report.isError ? (
          <p role="alert" className="text-warning text-sm">
            No se pudo consultar el parte de la empresa. Puedes continuar en este dispositivo y
            reintentar el guardado cuando vuelva a estar disponible.
          </p>
        ) : null}
        {localStorageFailed ? (
          <p role="alert" className="text-destructive text-sm">
            El dispositivo no pudo conservar el borrador. Guarda el parte antes de salir.
          </p>
        ) : null}
        {closed && changed ? (
          <p role="alert" className="text-warning text-sm">
            Este dispositivo conserva cambios sin enviar. La visita ya está cerrada y el parte de la
            empresa no puede modificarse desde aquí.
          </p>
        ) : null}
        {conflict ? (
          <div role="alert" className="border-warning rounded-lg border p-3 text-sm">
            <p className="font-semibold">Hay dos versiones del parte</p>
            <p>La versión de la empresa cambió desde que empezaste este borrador.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <strong>Empresa, revisión {serverRevision}</strong>
                <p className="whitespace-pre-line">{report.data?.data.notes || 'Sin notas'}</p>
                <p>Recomendaciones: {report.data?.data.recommendations || 'Sin recomendaciones'}</p>
                <p>Próximas actuaciones: {report.data?.data.next_actions || 'Sin actuaciones'}</p>
                <ul className="list-inside list-disc">
                  {report.data?.data.checklist.map((item) => (
                    <li key={item.id}>
                      {item.done ? 'Hecha' : 'Pendiente'}: {item.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Este dispositivo, revisión {draft?.baseRevision}</strong>
                <p className="whitespace-pre-line">{data.notes || 'Sin notas'}</p>
                <p>Recomendaciones: {data.recommendations || 'Sin recomendaciones'}</p>
                <p>Próximas actuaciones: {data.next_actions || 'Sin actuaciones'}</p>
                <ul className="list-inside list-disc">
                  {data.checklist.map((item) => (
                    <li key={item.id}>
                      {item.done ? 'Hecha' : 'Pendiente'}: {item.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" isDisabled={busy} onPress={useServerVersion}>
                Usar versión de la empresa
              </Button>
              <Button variant="outline" isDisabled={busy} onPress={keepLocalVersion}>
                Seguir con mi borrador tras revisarlo
              </Button>
            </div>
          </div>
        ) : null}
        <fieldset disabled={busy} className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Lista de comprobación</p>
            {data.checklist.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Añade las tareas realizadas en la visita.
              </p>
            ) : null}
            {data.checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={closed}
                  aria-label={`Completar ${item.label}`}
                  onChange={(event) =>
                    change({
                      ...data,
                      checklist: data.checklist.map((row) =>
                        row.id === item.id ? { ...row, done: event.target.checked } : row,
                      ),
                    })
                  }
                />
                <input
                  type="text"
                  value={item.label}
                  disabled={closed}
                  maxLength={160}
                  aria-label="Comprobación"
                  className="border-input bg-background min-w-0 flex-1 rounded-lg border px-2 py-1"
                  onChange={(event) =>
                    change({
                      ...data,
                      checklist: data.checklist.map((row) =>
                        row.id === item.id ? { ...row, label: event.target.value } : row,
                      ),
                    })
                  }
                />
                {!closed ? (
                  <Button
                    variant="outline"
                    onPress={() =>
                      change({
                        ...data,
                        checklist: data.checklist.filter((row) => row.id !== item.id),
                      })
                    }
                  >
                    Quitar
                  </Button>
                ) : null}
              </div>
            ))}
            {!closed && data.checklist.length < 50 ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLabel}
                  maxLength={160}
                  aria-label="Nueva comprobación"
                  placeholder="Nueva comprobación"
                  className="border-input bg-background min-w-0 flex-1 rounded-lg border px-2 py-1"
                  onChange={(event) => setNewLabel(event.target.value)}
                />
                <Button
                  variant="outline"
                  isDisabled={!newLabel.trim()}
                  onPress={() => {
                    change({
                      ...data,
                      checklist: [
                        ...data.checklist,
                        { id: crypto.randomUUID(), label: newLabel.trim(), done: false },
                      ],
                    })
                    setNewLabel('')
                  }}
                >
                  Añadir
                </Button>
              </div>
            ) : null}
          </div>
          {closed ? (
            <div>
              <p className="text-sm font-medium">Notas del técnico</p>
              <p className="text-sm whitespace-pre-line">{data.notes || 'Sin notas'}</p>
              <p className="mt-2 text-sm font-medium">Recomendaciones</p>
              <p className="text-sm whitespace-pre-line">
                {data.recommendations || 'Sin recomendaciones'}
              </p>
              <p className="mt-2 text-sm font-medium">Próximas actuaciones</p>
              <p className="text-sm whitespace-pre-line">
                {data.next_actions || 'Sin actuaciones previstas'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <TextareaField
                label="Notas del técnico"
                value={data.notes}
                maxLength={4000}
                onChange={(notes) => change({ ...data, notes })}
                placeholder="Qué se hizo y qué se encontró"
              />
              <TextareaField
                label="Recomendaciones al cliente"
                value={data.recommendations ?? ''}
                maxLength={2000}
                onChange={(recommendations) => change({ ...data, recommendations })}
                placeholder="Cuidados, seguimiento y recomendaciones"
              />
              <TextareaField
                label="Próximas actuaciones"
                value={data.next_actions ?? ''}
                maxLength={2000}
                onChange={(nextActions) => change({ ...data, next_actions: nextActions })}
                placeholder="Trabajo pendiente o próxima revisión"
              />
            </div>
          )}
        </fieldset>
        {closed ? (
          <p className="text-muted-foreground text-sm">
            La visita está cerrada; el parte es de solo lectura.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              isDisabled={
                busy || conflict || !changed || data.checklist.some((item) => !item.label.trim())
              }
              onPress={() => void save()}
            >
              {busy ? 'Guardando…' : 'Guardar parte'}
            </Button>
            {draft && !conflict ? (
              <Button variant="outline" isDisabled={busy} onPress={useServerVersion}>
                Descartar cambios locales
              </Button>
            ) : null}
            <p className="text-muted-foreground text-xs">
              {changed
                ? 'Cambios conservados en este dispositivo hasta guardarlos.'
                : report.data
                  ? `Guardado en la empresa · revisión ${serverRevision}`
                  : 'Aún no hay un parte guardado.'}
            </p>
          </div>
        )}
        <VisitMeasurementsPanel
          tenantId={tenantId}
          visitId={visit.id}
          userId={userId}
          closed={closed}
        />
        <VisitPhotosPanel tenantId={tenantId} visitId={visit.id} userId={userId} closed={closed} />
        {visit.status === 'completed' && ['owner', 'admin'].includes(session?.role ?? '') ? (
          <VisitReportShares tenantId={tenantId} visitId={visit.id} />
        ) : null}
        <VisitFieldEntriesPanel
          tenantId={tenantId}
          visitId={visit.id}
          userId={userId}
          closed={closed}
        />
        <IncidentPanel tenantId={tenantId} visitId={visit.id} userId={userId} />
      </CardContent>
    </Card>
  )
}
