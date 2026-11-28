import { Button } from '@doscientos/ui'
import { CaretDownIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { calendarDate, moveDays, todayInMadrid } from '@/shared/lib/date-range'

import {
  qualityOwnersQuery,
  qualityReviewsQuery,
  type QualityRecord,
} from '../application/visit-quality-queries'
import {
  lastClosedQualityWeek,
  qualityStatusLabels,
  type QualityMode,
} from '../domain/visit-quality'
import { VisitQualityEditor } from './visit-quality-editor'

const weekFormat = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const touch = 'min-h-11'

export function VisitQualityPanel({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <details
      className="group border-border rounded-lg border"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="focus-visible:ring-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
        Muestreo de calidad
        <CaretDownIcon aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
      </summary>
      {open ? <QualityResults key={tenantId} tenantId={tenantId} /> : null}
    </details>
  )
}

function QualityResults({ tenantId }: { tenantId: string }) {
  const last = lastClosedQualityWeek(todayInMadrid())
  const [week, setWeek] = useState(last)
  const [mode, setMode] = useState<QualityMode>('sample')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const results = useQuery(qualityReviewsQuery(tenantId, week, mode, page))
  const owners = useQuery(qualityOwnersQuery(tenantId))
  const ownerNames = new Map((owners.data ?? []).map(({ id, label }) => [id, label]))
  const changeContext = (nextMode: QualityMode, nextWeek: string, nextPage: number) => {
    setMode(nextMode)
    setWeek(nextWeek)
    setPage(nextPage)
    setSelected(null)
  }
  return (
    <section aria-label="Supervisión de servicios" className="border-border space-y-3 border-t p-3">
      <p className="text-muted-foreground text-sm">
        Muestra estable de visitas con primer parte cerrado esa semana: aproximadamente un 10 %,
        hasta diez. No incluye visitas sin parte ni mide el rendimiento de personas.
      </p>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Vista de supervisión</legend>
        <Button
          size="sm"
          variant={mode === 'sample' ? 'default' : 'outline'}
          className={touch}
          aria-pressed={mode === 'sample'}
          onPress={() => changeContext('sample', week, 0)}
        >
          Muestra semanal
        </Button>
        <Button
          size="sm"
          variant={mode === 'open' ? 'default' : 'outline'}
          className={touch}
          aria-pressed={mode === 'open'}
          onPress={() => changeContext('open', week, 0)}
        >
          Correcciones abiertas
        </Button>
      </fieldset>
      {mode === 'sample' ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className={touch}
            isDisabled={week <= '2000-01-03'}
            onPress={() => changeContext(mode, moveDays(week, -7), 0)}
          >
            Semana anterior
          </Button>
          <output className="text-muted-foreground min-w-24 flex-1 text-center text-sm">
            {weekFormat.formatRange(calendarDate(week), calendarDate(moveDays(week, 6)))}
          </output>
          <Button
            size="sm"
            variant="outline"
            className={touch}
            isDisabled={week >= last}
            onPress={() => changeContext(mode, moveDays(week, 7), 0)}
          >
            Semana siguiente
          </Button>
        </div>
      ) : null}
      {results.isPending ? <output>Buscando servicios…</output> : null}
      {results.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm">No se pudo cargar la supervisión.</p>
          <Button
            variant="outline"
            size="sm"
            className={touch}
            onPress={() => void results.refetch()}
          >
            Reintentar supervisión
          </Button>
        </div>
      ) : null}
      {results.isSuccess && results.data.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {mode === 'open'
            ? 'No hay correcciones abiertas en esta página.'
            : 'No hay partes cerrados por primera vez esta semana.'}
        </p>
      ) : null}
      <ul className="divide-border divide-y">
        {results.data?.rows.map((record) => (
          <QualityCard
            key={record.report_version_id}
            record={record}
            tenantId={tenantId}
            ownerNames={ownerNames}
            owners={owners.data ?? []}
            ownersReady={owners.isSuccess}
            ownersError={owners.isError}
            retryOwners={() => void owners.refetch()}
            selected={selected === record.report_version_id}
            onToggle={() =>
              setSelected(selected === record.report_version_id ? null : record.report_version_id)
            }
          />
        ))}
      </ul>
      {page > 0 || results.data?.hasMore ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className={touch}
            isDisabled={page === 0}
            onPress={() => changeContext(mode, week, page - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm">Página {page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            className={touch}
            isDisabled={!results.data?.hasMore}
            onPress={() => changeContext(mode, week, page + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function QualityCard({
  record,
  tenantId,
  ownerNames,
  owners,
  ownersReady,
  ownersError,
  retryOwners,
  selected,
  onToggle,
}: {
  record: QualityRecord
  tenantId: string
  ownerNames: Map<string, string>
  owners: { id: string; label: string }[]
  ownersReady: boolean
  ownersError: boolean
  retryOwners: () => void
  selected: boolean
  onToggle: () => void
}) {
  const title = record.visit_title || 'Visita'
  return (
    <li className="min-w-0 space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-40 break-words">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-muted-foreground text-xs">
            {record.client_name || 'Cliente'} · Parte v{record.version}
          </p>
          <p className="text-muted-foreground text-xs">
            {record.status ? qualityStatusLabels[record.status] : 'Por supervisar'}
            {record.owner_id && ownersReady
              ? ` · ${ownerNames.get(record.owner_id) ?? 'Responsable anterior no disponible'}`
              : ''}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className={touch}
          aria-expanded={selected}
          aria-label={selected ? `Cerrar revisión de ${title}` : `Supervisar ${title}`}
          onPress={onToggle}
        >
          {selected ? 'Cerrar' : 'Supervisar'}
        </Button>
      </div>
      {selected ? (
        <VisitQualityEditor
          key={record.revision}
          tenantId={tenantId}
          record={record}
          owners={owners}
          ownersReady={ownersReady}
          ownersError={ownersError}
          retryOwners={retryOwners}
        />
      ) : null}
    </li>
  )
}
