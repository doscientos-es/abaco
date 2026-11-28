import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { CheckCircleIcon, ClipboardTextIcon } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { useEffect, useRef, useState, type RefObject } from 'react'

import { useSession } from '@/features/auth'
import { VisitFieldEntriesPanel } from '@/features/field-entries/ui/visit-field-entries-panel'
import { IncidentPanel } from '@/features/incidents/ui/incident-panel'
import { useActionLock } from '@/shared/lib/use-action-lock'
import { TextareaField } from '@/shared/ui/form'
import { WorkerLoading } from '@/shared/ui/worker-state'

import { visitEvidenceAnchor } from '../application/pending-visit-evidence'
import type { VisitSummary } from '../application/visit-actions'
import {
  loadVisitReport,
  saveVisitReport,
  type VisitReport,
  type VisitReportData,
} from '../application/visit-report-actions'
import {
  equalVisitReportData,
  readVisitReportLocalDraft,
  removeVisitReportLocalDraft,
  visitReportDraftKey,
  writeVisitReportLocalDraft,
  type LocalVisitReportDraft,
} from '../application/visit-report-local-draft'
import { localVisitDay } from '../domain/next-assigned-visit'
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
  guardRef,
}: {
  visit: VisitSummary
  tenantId: string
  userId: string
  guardRef?: RefObject<'saving' | 'unpersisted' | null>
}) {
  const queryClient = useQueryClient()
  const session = useSession()
  const key = visitReportDraftKey(userId, tenantId, visit.id)
  const queryKey = ['visit-report', tenantId, visit.id, userId]
  const report = useQuery({
    queryKey,
    queryFn: () => loadVisitReport(tenantId, visit.id),
    refetchOnMount: 'always',
  })
  const [draft, setDraft] = useState<LocalVisitReportDraft | null>(() =>
    readVisitReportLocalDraft(key),
  )
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveLock = useActionLock()
  const [localStorageFailed, setLocalStorageFailed] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const closed = !['scheduled', 'in_progress'].includes(visit.status)
  const [confirmedOperation, setConfirmedOperation] = useState<string | null>(null)
  const data =
    (draft?.operationId !== confirmedOperation ? draft?.data : undefined) ??
    report.data?.data ??
    emptyData()
  const serverRevision = report.data?.revision ?? 0
  // A cached revision can match a draft even though someone changed the report on the
  // server. Only a settled fetch in this editor can confirm the draft is redundant.
  const serverReportConfirmed =
    report.isSuccess && report.isFetchedAfterMount && report.fetchStatus === 'idle'
  const matchesServer = Boolean(
    draft &&
    serverReportConfirmed &&
    equalVisitReportData(draft.data, report.data?.data ?? emptyData()),
  )
  const changed = Boolean(draft && !matchesServer && confirmedOperation !== draft.operationId)
  const conflict =
    !closed &&
    report.isSuccess &&
    changed &&
    draft !== null &&
    draft.baseRevision !== serverRevision
  const localGuard = useRef<'saving' | 'unpersisted' | null>(null)
  const guard = guardRef ?? localGuard
  const guarded = busy ? 'saving' : localStorageFailed && changed ? 'unpersisted' : null
  useEffect(() => {
    guard.current = guarded
    return () => {
      guard.current = null
    }
  }, [guard, guarded])
  useBlocker({
    shouldBlockFn: () =>
      guard.current === 'saving' ||
      (guard.current === 'unpersisted' &&
        !window.confirm(
          'El dispositivo no pudo conservar los cambios del parte. ¿Salir sin guardarlos?',
        )),
    enableBeforeUnload: () => guard.current !== null,
  })
  useEffect(() => {
    if (!matchesServer || !draft || busy) return
    removeVisitReportLocalDraft(key, draft.operationId)
  }, [busy, draft, key, matchesServer])
  if (matchesServer && draft && !busy && confirmedOperation !== draft.operationId) {
    setConfirmedOperation(draft.operationId)
  }
  const canEdit = !closed && !busy && (report.isSuccess || report.isError || draft !== null)
  const invalidChecklist = data.checklist.some((item) => !item.label.trim())
  const completedChecks = data.checklist.filter(({ done }) => done).length

  function change(next: VisitReportData) {
    if (!canEdit) return
    setSaveError(null)
    if (serverReportConfirmed && equalVisitReportData(next, report.data?.data ?? emptyData())) {
      resetToServerVersion()
      return
    }
    const updated: LocalVisitReportDraft = {
      visitDay: localVisitDay(visit),
      baseRevision: changed && draft ? draft.baseRevision : serverRevision,
      data: next,
      operationId: crypto.randomUUID(),
    }
    setDraft(updated)
    setLocalStorageFailed(!writeVisitReportLocalDraft(key, updated))
  }

  function resetToServerVersion() {
    if (!report.isSuccess || busy) return
    removeVisitReportLocalDraft(key, draft?.operationId)
    setDraft(null)
    setLocalStorageFailed(false)
    setSaveError(null)
  }

  function keepLocalVersion() {
    if (!draft || !report.isSuccess || busy) return
    const updated = {
      ...draft,
      visitDay: localVisitDay(visit),
      baseRevision: serverRevision,
      operationId: crypto.randomUUID(),
    }
    setDraft(updated)
    setLocalStorageFailed(!writeVisitReportLocalDraft(key, updated))
    setSaveError(null)
  }

  async function save() {
    if (busy || !draft || conflict || closed || !changed || invalidChecklist || !saveLock.acquire())
      return
    guard.current = 'saving'
    setBusy(true)
    setSaveError(null)
    try {
      const revision = await saveVisitReport({
        tenantId,
        visitId: visit.id,
        expectedRevision: draft.baseRevision,
        data: draft.data,
        operationId: draft.operationId,
      })
      removeVisitReportLocalDraft(key, draft.operationId)
      queryClient.setQueryData<VisitReport>(queryKey, {
        tenant_id: tenantId,
        visit_id: visit.id,
        data: draft.data,
        revision,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      setDraft(null)
      setLocalStorageFailed(false)
      await queryClient.invalidateQueries({ queryKey })
      toast.success('Parte guardado en la empresa')
    } catch (error) {
      const fresh = await report.refetch()
      if (fresh.isSuccess && fresh.data && equalVisitReportData(fresh.data.data, draft.data)) {
        removeVisitReportLocalDraft(key, draft.operationId)
        setDraft(null)
        setLocalStorageFailed(false)
        toast.success('Guardado confirmado')
      } else {
        const message =
          error instanceof Error ? error.message : 'Comprueba tu conexión e inténtalo de nuevo.'
        setSaveError(message)
        toast.error('No se pudo guardar el parte', { description: message })
      }
    } finally {
      setBusy(false)
      saveLock.release()
    }
  }

  function addCheck() {
    const label = newLabel.trim()
    if (!canEdit || !label || data.checklist.length >= 50) return
    change({
      ...data,
      checklist: [...data.checklist, { id: crypto.randomUUID(), label, done: false }],
    })
    setNewLabel('')
  }

  return (
    <Card className="border-border bg-card overflow-visible shadow-none">
      <CardHeader className="space-y-1">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <ClipboardTextIcon size={18} aria-hidden="true" /> <h4>Parte de visita</h4>
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          {closed
            ? 'Consulta lo registrado en este trabajo.'
            : 'Anota lo realizado y los próximos pasos antes de cerrar la visita.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {visit.status === 'completed' ? (
          <ClosedVisitReport tenantId={tenantId} visitId={visit.id} />
        ) : null}
        {report.isPending && !draft ? <WorkerLoading label="Cargando parte…" /> : null}
        {report.isError ? (
          <div className="border-border flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
            <p role="alert" className="min-w-0 flex-1">
              {closed
                ? 'No se pudo consultar el parte de la empresa.'
                : 'No se pudo consultar el parte de la empresa. Puedes seguir escribiendo y guardar cuando vuelva la conexión.'}
            </p>
            <Button size="sm" variant="outline" onPress={() => void report.refetch()}>
              Reintentar carga
            </Button>
          </div>
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
              <Button variant="outline" isDisabled={busy} onPress={resetToServerVersion}>
                Usar versión de la empresa
              </Button>
              <Button variant="outline" isDisabled={busy} onPress={keepLocalVersion}>
                Seguir con mi borrador tras revisarlo
              </Button>
            </div>
          </div>
        ) : null}
        {closed && !report.data && !draft && !report.isSuccess ? null : (
          <fieldset disabled={!closed && !canEdit} className="min-w-0 space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-1">
                <h3 className="text-sm font-semibold">Lista de comprobación</h3>
                {data.checklist.length ? (
                  <p className="text-muted-foreground text-xs">
                    {completedChecks} de {data.checklist.length} hechas
                  </p>
                ) : null}
              </div>
              {data.checklist.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {closed
                    ? 'No hay comprobaciones registradas.'
                    : 'Añade las tareas realizadas en la visita.'}
                </p>
              ) : null}
              {data.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-primary size-5 shrink-0"
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
                    aria-label={`Editar comprobación: ${item.label || 'sin nombre'}`}
                    className="border-input bg-background min-h-11 min-w-0 flex-1 rounded-lg border px-2 py-1"
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
                      className="min-h-11"
                      aria-label={`Quitar comprobación: ${item.label || 'sin nombre'}`}
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
                    className="border-input bg-background min-h-11 min-w-0 flex-1 rounded-lg border px-2 py-1"
                    onChange={(event) => setNewLabel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        addCheck()
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    className="min-h-11"
                    isDisabled={!canEdit || !newLabel.trim()}
                    onPress={addCheck}
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
        )}
        {closed ? (
          <p className="text-muted-foreground text-sm">
            La visita está cerrada; el parte es de solo lectura.
          </p>
        ) : (
          <div className="border-border bg-card sticky bottom-0 z-[2] grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="min-h-11 max-sm:flex-1"
                isDisabled={busy || conflict || !changed || invalidChecklist}
                onPress={() => void save()}
              >
                {busy ? 'Guardando…' : 'Guardar parte'}
              </Button>
              {changed && !conflict ? (
                <Button
                  variant="ghost"
                  className="min-h-11"
                  isDisabled={busy || !report.isSuccess}
                  onPress={resetToServerVersion}
                >
                  Descartar cambios locales
                </Button>
              ) : null}
            </div>
            <output
              className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs"
              aria-live="polite"
            >
              {!changed && report.data ? <CheckCircleIcon size={16} aria-hidden="true" /> : null}
              {busy
                ? 'Guardando en la empresa…'
                : invalidChecklist
                  ? 'Pon un nombre a todas las comprobaciones para guardar.'
                  : changed
                    ? localStorageFailed
                      ? 'Cambios sin guardar; el dispositivo no pudo conservar una copia.'
                      : 'Borrador en este dispositivo. Guarda el parte para enviarlo a la empresa.'
                    : report.data
                      ? `Guardado en la empresa · revisión ${serverRevision}`
                      : 'Aún no hay un parte guardado.'}
            </output>
            {saveError ? (
              <p role="alert" className="text-destructive text-sm sm:col-span-2">
                No se pudo guardar el parte. {saveError}
              </p>
            ) : null}
          </div>
        )}
        <div
          id={visitEvidenceAnchor(visit.id, 'photos')}
          tabIndex={-1}
          className="focus-visible:outline-ring scroll-m-3 outline-offset-2"
        >
          <VisitPhotosPanel
            tenantId={tenantId}
            visitId={visit.id}
            userId={userId}
            closed={closed}
          />
        </div>
        {visit.status === 'completed' && session?.role === 'admin' ? (
          <VisitReportShares tenantId={tenantId} visitId={visit.id} />
        ) : null}
        <div
          id={visitEvidenceAnchor(visit.id, 'activity')}
          tabIndex={-1}
          className="focus-visible:outline-ring scroll-m-3 outline-offset-2"
        >
          <VisitFieldEntriesPanel
            tenantId={tenantId}
            visitId={visit.id}
            userId={userId}
            closed={closed}
          />
        </div>
        <div
          id={visitEvidenceAnchor(visit.id, 'incidents')}
          tabIndex={-1}
          className="focus-visible:outline-ring scroll-m-3 outline-offset-2"
        >
          <IncidentPanel tenantId={tenantId} visitId={visit.id} userId={userId} />
        </div>
      </CardContent>
    </Card>
  )
}
