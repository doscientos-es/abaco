import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { CheckCircleIcon, ClipboardTextIcon } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { useEffect, useRef, useState, type RefObject } from 'react'

import { useSession } from '@/features/auth'
import { VisitFieldEntriesPanel } from '@/features/field-entries/ui/visit-field-entries-panel'
import { IncidentPanel } from '@/features/incidents/ui/incident-panel'
import { useActionLock } from '@/shared/lib/use-action-lock'
import { browserOnline, useBrowserOnline } from '@/shared/lib/use-browser-online'
import { TextareaField } from '@/shared/ui/form'
import { WorkerLoading } from '@/shared/ui/worker-state'

import { visitEvidenceAnchor } from '../application/pending-visit-evidence'
import { sendQueuedVisitReport } from '../application/send-queued-visit-report'
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
import type { OfflineReportBase } from '../application/worker-offline-day'
import { localVisitDay } from '../domain/next-assigned-visit'
import { ClosedVisitReport } from './closed-visit-report'
import { VisitHandoffsPanel } from './visit-handoffs-panel'
import { VisitMeasurementsPanel } from './visit-measurements-panel'
import { VisitPhotosPanel } from './visit-photos-panel'
import { VisitReportDictation } from './visit-report-dictation'
import { VisitReportShares } from './visit-report-shares'

const noteLimit = 4000

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
  offlineBase,
}: {
  visit: VisitSummary
  tenantId: string
  userId: string
  guardRef?: RefObject<'saving' | 'unpersisted' | null>
  offlineBase?: OfflineReportBase | undefined
}) {
  const queryClient = useQueryClient()
  const session = useSession()
  const online = useBrowserOnline()
  const editorScope = `${tenantId}:${userId}:${visit.id}`
  const scopeActive = useRef<string | null>(null)
  useEffect(() => {
    scopeActive.current = editorScope
    return () => {
      scopeActive.current = null
    }
  }, [editorScope])
  const scopeIsCurrent = () => scopeActive.current === editorScope
  const key = visitReportDraftKey(userId, tenantId, visit.id)
  const queryKey = ['visit-report', tenantId, visit.id, userId]
  const report = useQuery({
    queryKey,
    queryFn: () => loadVisitReport(tenantId, visit.id),
    refetchOnMount: 'always',
    enabled: online,
  })
  const [draft, setDraft] = useState<LocalVisitReportDraft | null>(() =>
    readVisitReportLocalDraft(key),
  )
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reviewConflictId, setReviewConflictId] = useState<string | null>(null)
  const [received, setReceived] = useState<number | null>(null)
  const saveLock = useActionLock()
  const [localStorageFailed, setLocalStorageFailed] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const closed = !['scheduled', 'in_progress'].includes(visit.status)
  const [confirmedOperation, setConfirmedOperation] = useState<string | null>(null)
  const localBase =
    !online && offlineBase && offlineBase.revision >= (report.data?.revision ?? 0)
      ? offlineBase
      : null
  const data =
    (draft?.operationId !== confirmedOperation ? draft?.data : undefined) ??
    (localBase ? localBase.data : report.data?.data) ??
    emptyData()
  const serverRevision = localBase?.revision ?? report.data?.revision ?? 0
  const queued = draft?.delivery === 'queued'
  // A cached revision can match a draft even though someone changed the report on the
  // server. Only a settled fetch in this editor can confirm the draft is redundant.
  const serverReportConfirmed =
    report.isSuccess && report.isFetchedAfterMount && report.fetchStatus === 'idle'
  const matchesServer = Boolean(
    draft &&
    !queued &&
    serverReportConfirmed &&
    equalVisitReportData(draft.data, report.data?.data ?? emptyData()),
  )
  const changed = Boolean(draft && !matchesServer && confirmedOperation !== draft.operationId)
  const conflict =
    !closed &&
    report.isSuccess &&
    changed &&
    draft !== null &&
    draft.baseRevision !== serverRevision &&
    (!queued || reviewConflictId === draft.operationId)
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
  const canEdit =
    !closed &&
    !busy &&
    (report.isSuccess || report.isError || draft !== null || offlineBase !== undefined)
  const invalidChecklist = data.checklist.some((item) => !item.label.trim())
  const completedChecks = data.checklist.filter(({ done }) => done).length

  function change(next: VisitReportData) {
    if (!canEdit) return
    setSaveError(null)
    setReceived(null)
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

  function saveAsPending(current: LocalVisitReportDraft) {
    const pending = { ...current, delivery: 'queued' } as const
    if (!writeVisitReportLocalDraft(key, pending)) {
      setLocalStorageFailed(true)
      return
    }
    setLocalStorageFailed(false)
    setSaveError(null)
    setDraft(pending)
  }

  function acknowledge(
    current: LocalVisitReportDraft,
    revision: number,
    serverReport?: VisitReport | null,
  ) {
    removeVisitReportLocalDraft(key, current.operationId)
    queryClient.setQueryData<VisitReport>(
      queryKey,
      serverReport ?? {
        tenant_id: tenantId,
        visit_id: visit.id,
        data: current.data,
        revision,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
    )
    setDraft(null)
    setLocalStorageFailed(false)
    if (current.delivery === 'queued') setReceived(revision)
  }

  async function save() {
    if (busy || !draft || conflict || closed || !changed || invalidChecklist) return
    if (!online || !browserOnline()) {
      if (!queued) saveAsPending(draft)
      return
    }
    if (!saveLock.acquire()) return
    guard.current = 'saving'
    setBusy(true)
    setSaveError(null)
    try {
      if (queued) {
        const result = await sendQueuedVisitReport({
          tenantId,
          userId,
          visitId: visit.id,
          day: localVisitDay(visit),
          draft,
          stillActive: scopeIsCurrent,
        })
        if (!scopeIsCurrent()) return
        if (result.state === 'conflict') {
          queryClient.setQueryData<VisitReport | null>(queryKey, result.serverReport)
          setReviewConflictId(draft.operationId)
          return
        }
        acknowledge(draft, result.revision, result.serverReport)
      } else {
        const revision = await saveVisitReport({
          tenantId,
          visitId: visit.id,
          expectedRevision: draft.baseRevision,
          data: draft.data,
          operationId: draft.operationId,
        })
        if (!scopeIsCurrent()) return
        acknowledge(draft, revision)
      }
      if (browserOnline()) await queryClient.invalidateQueries({ queryKey })
      toast.success('Parte guardado en la empresa')
    } catch (error) {
      if (!scopeIsCurrent()) return
      if (!browserOnline()) {
        if (!queued) saveAsPending(draft)
        return
      }
      const fresh = queued ? null : await report.refetch()
      if (!scopeIsCurrent()) return
      if (fresh?.isSuccess && fresh.data && equalVisitReportData(fresh.data.data, draft.data)) {
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
        <VisitHandoffsPanel tenantId={tenantId} visit={visit} userId={userId} />
        {visit.status === 'completed' ? (
          <ClosedVisitReport tenantId={tenantId} visitId={visit.id} />
        ) : null}
        {report.isPending && online && !offlineBase && !draft ? (
          <WorkerLoading label="Cargando parte…" />
        ) : null}
        {!online && !closed ? (
          <p className="text-muted-foreground text-sm">
            {offlineBase || draft || report.data
              ? 'Sin conexión. Los cambios se quedan en este dispositivo. Que un parte esté pendiente no significa que la empresa lo haya recibido.'
              : 'Sin conexión y sin una copia preparada de este parte. Conéctate para abrirlo.'}
          </p>
        ) : null}
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
                  maxLength={noteLimit}
                  onChange={(notes) => change({ ...data, notes })}
                  placeholder="Qué se hizo y qué se encontró"
                />
                <VisitReportDictation
                  key={key}
                  notes={data.notes}
                  maxLength={noteLimit}
                  disabled={!canEdit}
                  onAppend={(notes) => change({ ...data, notes })}
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
                isDisabled={busy || conflict || !changed || invalidChecklist || (!online && queued)}
                onPress={() => void save()}
              >
                {busy
                  ? 'Guardando…'
                  : online
                    ? queued
                      ? 'Enviar parte pendiente'
                      : 'Guardar parte'
                    : queued
                      ? 'Pendiente de enviar'
                      : 'Guardar para enviar'}
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
                      : queued
                        ? 'Pendiente de enviar · todavía no recibido por la empresa.'
                        : 'Borrador en este dispositivo. Guarda el parte para enviarlo a la empresa.'
                    : received !== null
                      ? `Recibido por la empresa · revisión ${received}`
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
        <VisitMeasurementsPanel
          key={`${tenantId}:${userId}:${visit.id}`}
          tenantId={tenantId}
          visitId={visit.id}
          userId={userId}
          timezone={visit.timezone}
          readOnly={closed || session?.tenantId !== tenantId}
        />
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
