import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { SelectField } from '@/shared/ui/form'

import {
  qualityEventsQuery,
  qualityKey,
  recordQualityReview,
  type QualityRecord,
} from '../application/visit-quality-queries'
import { loadClosedVisitReportVersion } from '../application/visit-report-actions'
import {
  qualityCategoryLabels,
  qualityStatuses,
  qualityStatusLabels,
  type QualityCategory,
  type QualityStatus,
} from '../domain/visit-quality'
import { ClosedVisitReport } from './closed-visit-report'

type Owner = { id: string; label: string }
const format = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  dateStyle: 'short',
  timeStyle: 'short',
})

export function VisitQualityEditor({
  tenantId,
  record,
  owners,
  ownersReady,
  ownersError,
  retryOwners,
}: {
  tenantId: string
  record: QualityRecord
  owners: Owner[]
  ownersReady: boolean
  ownersError: boolean
  retryOwners: () => void
}) {
  const queryClient = useQueryClient()
  const [showReport, setShowReport] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [status, setStatus] = useState<QualityStatus | ''>('')
  const [category, setCategory] = useState<QualityCategory | ''>(record.category ?? '')
  const [ownerId, setOwnerId] = useState(record.owner_id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const operations = useRef(new Map<string, string>())
  const reportKey = [
    'closed-visit-report-version',
    tenantId,
    record.visit_id,
    record.report_version_id,
  ]
  const report = useQuery({
    queryKey: reportKey,
    queryFn: () =>
      loadClosedVisitReportVersion(tenantId, record.visit_id, record.report_version_id),
    enabled: showReport,
  })
  const availableStatuses = qualityStatuses(record.status)
  const needsCorrection = Boolean(status && status !== 'reviewed')
  const verifiedOwner = ownersReady && owners.some(({ id }) => id === ownerId)
  const canSave =
    (record.revision > 0 ||
      (showReport && report.isSuccess && report.data?.id === record.report_version_id)) &&
    status &&
    availableStatuses.includes(status) &&
    (!needsCorrection || (verifiedOwner && category)) &&
    (status !== record.status || category !== record.category || ownerId !== record.owner_id)

  async function save() {
    if (pending.current || !canSave || !status) return
    const payload = {
      tenantId,
      reportId: record.report_version_id,
      expectedRevision: record.revision,
      status,
      category: (needsCorrection && category) || null,
      ownerId: needsCorrection ? ownerId : null,
    }
    const fingerprint = JSON.stringify(payload)
    const operationId = operations.current.get(fingerprint) ?? crypto.randomUUID()
    operations.current.set(fingerprint, operationId)
    pending.current = true
    setError('')
    setBusy(true)
    try {
      await recordQualityReview({ ...payload, operationId })
      operations.current.delete(fingerprint)
      await queryClient.invalidateQueries({ queryKey: qualityKey(tenantId) })
      toast.success('Revisión de calidad registrada')
    } catch (error) {
      setError(
        error instanceof Error && error.message === 'conflict'
          ? 'Otra persona ha cambiado la revisión. Actualiza los datos antes de continuar.'
          : 'No se pudo guardar la revisión. Puedes intentarlo de nuevo.',
      )
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="bg-muted/40 min-w-0 space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          aria-expanded={showReport}
          onPress={() => setShowReport(!showReport)}
        >
          {showReport ? 'Ocultar parte' : 'Ver parte cerrado'}
        </Button>
        {record.revision > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            aria-expanded={showHistory}
            onPress={() => setShowHistory(!showHistory)}
          >
            {showHistory ? 'Ocultar historial' : 'Ver historial'}
          </Button>
        ) : null}
      </div>
      {showReport ? (
        <ClosedVisitReport
          tenantId={tenantId}
          visitId={record.visit_id}
          versionId={record.report_version_id}
        />
      ) : null}
      {showHistory ? (
        <QualityHistory tenantId={tenantId} reportId={record.report_version_id} owners={owners} />
      ) : null}
      <p className="text-muted-foreground text-sm">
        {record.revision === 0
          ? 'Abre el parte cerrado antes de registrar la revisión.'
          : 'Cada cambio de estado o responsable queda en el historial.'}{' '}
        La supervisión es interna y no modifica el parte ni avisa al cliente.
      </p>
      <SelectField
        label="Resultado"
        value={status}
        onChange={(value) => setStatus(availableStatuses.find((item) => item === value) ?? '')}
        isDisabled={busy}
        options={[
          { value: '', label: 'Elige un resultado' },
          ...availableStatuses.map((value) => ({ value, label: qualityStatusLabels[value] })),
        ]}
      />
      {needsCorrection ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <SelectField
            label="Tipo de corrección"
            value={category}
            isDisabled={busy}
            onChange={(value) =>
              setCategory(
                (Object.keys(qualityCategoryLabels) as QualityCategory[]).find(
                  (item) => item === value,
                ) ?? '',
              )
            }
            options={[
              { value: '', label: 'Elige un tipo' },
              ...Object.entries(qualityCategoryLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
          <div className="min-w-0 space-y-1.5">
            <SelectField
              label="Responsable de seguimiento"
              value={verifiedOwner ? ownerId : ''}
              onChange={setOwnerId}
              isDisabled={!ownersReady || busy}
              options={[
                { value: '', label: 'Elige a una persona' },
                ...owners.map(({ id, label }) => ({ value: id, label })),
              ]}
            />
            {ownersError ? (
              <div role="alert" className="space-y-1">
                <p>No se pudo cargar la lista de responsables.</p>
                <Button size="sm" variant="outline" onPress={retryOwners}>
                  Reintentar responsables
                </Button>
              </div>
            ) : !ownersReady ? (
              <output>Cargando responsables…</output>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="space-y-1">
          <p>{error}</p>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            onPress={() => void queryClient.invalidateQueries({ queryKey: qualityKey(tenantId) })}
          >
            Actualizar datos
          </Button>
        </div>
      ) : null}
      <Button
        className="min-h-11"
        isDisabled={Boolean(!canSave || busy)}
        onPress={() => void save()}
      >
        {busy ? 'Guardando…' : 'Guardar revisión'}
      </Button>
    </div>
  )
}

function QualityHistory({
  tenantId,
  reportId,
  owners,
}: {
  tenantId: string
  reportId: string
  owners: Owner[]
}) {
  const events = useQuery(qualityEventsQuery(tenantId, reportId))
  const names = new Map(owners.map(({ id, label }) => [id, label]))
  if (events.isPending) return <output>Cargando historial…</output>
  if (events.isError)
    return (
      <div role="alert">
        <p>No se pudo cargar el historial.</p>
        <Button size="sm" variant="outline" onPress={() => void events.refetch()}>
          Reintentar historial
        </Button>
      </div>
    )
  return (
    <section aria-label="Historial de calidad" className="space-y-1.5">
      <h4 className="text-sm font-semibold">Historial de calidad</h4>
      <ol className="divide-border divide-y">
        {events.data.map((event) => (
          <li key={event.revision} className="space-y-0.5 py-1.5 text-sm break-words">
            <p>
              {event.status ? qualityStatusLabels[event.status] : 'Estado no disponible'}
              {event.category ? ` · ${qualityCategoryLabels[event.category]}` : ''}
            </p>
            <p className="text-muted-foreground text-xs">
              <time dateTime={event.recorded_at}>{format.format(new Date(event.recorded_at))}</time>
              {' · Por '}
              {names.get(event.actor_id) ?? 'administración anterior'}
              {event.owner_id
                ? ` · Responsable: ${names.get(event.owner_id) ?? 'no disponible'}`
                : ''}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
