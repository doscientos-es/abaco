import { Button } from '@doscientos/ui'
import { DownloadSimple } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'

import { todayInMadrid } from '@/shared/lib/date-range'
import { SelectField } from '@/shared/ui/form'

import type { loadMonthlyClientReport } from '../application/monthly-client-report-actions'
import {
  monthlyClientReportDisclaimer,
  monthlyClientReportPeriod,
  monthlyClientReportRange,
  monthlyExtraStatuses,
  monthlyReportDateLabel,
  monthlyReportExtraQuantity,
  monthlyReportMonthLabel,
  monthlyVisitStatuses,
  summarizeMonthlyClientReport,
  type MonthlyReportDisplay,
} from '../domain/monthly-client-report'

type ReportProps = {
  tenantId: string
  userId: string
  clientId: string
  clientName: string
  locations: readonly { id: string; name: string }[]
  load: typeof loadMonthlyClientReport
}
type Scope = { month: string; location: string }
const previewPageSize = 12

export function MonthlyClientReport({
  tenantId,
  userId,
  clientId,
  clientName,
  locations,
  load,
}: ReportProps) {
  const monthId = useId()
  const helpId = useId()
  const [draft, setDraft] = useState<Scope>(() => ({
    month: todayInMadrid().slice(0, 7),
    location: '',
  }))
  const [scope, setScope] = useState<Scope | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const download = useRef<AbortController | null>(null)
  useEffect(() => () => download.current?.abort(), [])

  const { month, location } = scope ?? draft
  const query = useQuery({
    queryKey: ['monthly-client-services', tenantId, userId, clientId, month, location],
    queryFn: ({ signal }) =>
      load({ tenantId, clientId, locationId: location || null, month, signal }),
    enabled: Boolean(scope),
    // Do not retain private report data when the report unmounts or a filter changes.
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  })
  const centre = locations.find(({ id }) => id === draft.location)
  const validScope = Boolean(monthlyClientReportRange(draft.month) && (!draft.location || centre))
  const ready = scope && validScope && query.isSuccess && !query.isFetching ? query.data : null
  const report = ready
    ? {
        ...ready,
        month: draft.month,
        clientName,
        centreName: centre?.name ?? 'Todos los centros',
      }
    : null

  function update(next: Scope) {
    setDraft(next)
    setScope(null)
    setDownloadError('')
  }

  async function exportPdf() {
    if (!report || download.current) return
    const controller = new AbortController()
    download.current = controller
    setDownloadError('')
    setDownloading(true)
    try {
      const { downloadMonthlyClientReport } = await import('./monthly-client-report-pdf')
      await downloadMonthlyClientReport(report, controller.signal)
    } catch {
      if (!controller.signal.aborted)
        setDownloadError('No se pudo descargar el PDF. Vuelve a intentarlo.')
    } finally {
      download.current = null
      if (!controller.signal.aborted) setDownloading(false)
    }
  }

  return (
    <details className="border-border bg-muted/20 min-w-0 rounded-lg border">
      <summary className="focus-visible:ring-ring min-h-11 cursor-pointer rounded-md px-3 py-2.5 font-semibold focus-visible:ring-2 focus-visible:outline-none">
        Informe mensual de servicios
      </summary>
      <div className="min-w-0 space-y-4 px-3 pb-3 sm:px-4 sm:pb-4">
        <p id={helpId} className="text-muted-foreground text-sm leading-relaxed">
          {monthlyClientReportPeriod}
        </p>
        <form
          className="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            if (!validScope || downloading) return
            if (scope) void query.refetch()
            else setScope({ ...draft })
            setDownloadError('')
          }}
        >
          <label className="grid min-w-0 gap-1.5 text-sm font-medium" htmlFor={monthId}>
            Mes del informe
            <input
              id={monthId}
              type="month"
              className="border-input bg-background min-h-11 w-full min-w-0 rounded-md border px-3 py-2 text-base sm:text-sm"
              value={draft.month}
              onChange={(event) => update({ ...draft, month: event.target.value })}
              min="1900-01"
              max="2099-12"
              pattern="[0-9]{4}-[0-9]{2}"
              placeholder="AAAA-MM"
              required
              disabled={downloading}
              aria-describedby={helpId}
            />
          </label>
          <SelectField
            className="min-w-0"
            label="Centro del informe"
            value={draft.location}
            onChange={(location) => update({ ...draft, location })}
            options={[
              { value: '', label: 'Todos los centros' },
              ...locations.map(({ id, name }) => ({ value: id, label: name })),
            ]}
            isDisabled={downloading}
          />
          <Button
            type="submit"
            variant="outline"
            className="min-h-11"
            isDisabled={!validScope || downloading || Boolean(scope && query.isFetching)}
          >
            Preparar vista previa
          </Button>
        </form>
        <div aria-live="polite" className="text-sm">
          {scope && query.isFetching ? 'Preparando el informe…' : null}
        </div>
        {scope && query.isError && !query.isFetching ? (
          <p role="alert" className="text-sm">
            {query.error.message}
          </p>
        ) : null}
        {report ? (
          <>
            <ReportPreview key={`${draft.month}:${draft.location}`} report={report} />
            <div className="grid gap-2 sm:flex sm:items-center">
              <Button
                className="min-h-11"
                onPress={() => void exportPdf()}
                isDisabled={downloading || (!report.visits.length && !report.extras.length)}
              >
                <DownloadSimple aria-hidden="true" className="size-4 shrink-0" />
                {downloading ? 'Preparando PDF…' : 'Descargar informe en PDF'}
              </Button>
              {downloadError ? (
                <p role="alert" className="text-sm">
                  {downloadError}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </details>
  )
}

function ReportPreview({ report }: { report: MonthlyReportDisplay }) {
  const [page, setPage] = useState(0)
  const total = summarizeMonthlyClientReport(report)
  const entries = [
    ...report.visits.map((visit) => ({
      ...visit,
      key: `visit:${visit.id}`,
      dateLabel: 'Prevista',
      stateLabel: monthlyVisitStatuses[visit.status],
      type: 'Visita',
    })),
    ...report.extras.map((extra) => ({
      ...extra,
      key: `extra:${extra.id}`,
      dateLabel: 'Propuesto',
      stateLabel: monthlyExtraStatuses[extra.status],
      type: 'Extra',
      quantityLabel: monthlyReportExtraQuantity(extra),
    })),
  ]
  const pages = Math.max(1, Math.ceil(entries.length / previewPageSize))
  const current = Math.min(page, pages - 1)
  return (
    <section
      aria-label="Vista previa del informe"
      className="border-border bg-card min-w-0 space-y-3 rounded-md border p-3"
    >
      <div>
        <h3 className="font-semibold">Vista previa · {monthlyReportMonthLabel(report.month)}</h3>
        <p className="text-muted-foreground text-sm wrap-anywhere">
          {report.clientName} · {report.centreName}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
        {[
          ['Realizadas', total.completed],
          ['Pendientes o en curso', total.pending],
          ['Canceladas u omitidas', total.canceledOrSkipped],
          ['Extras', total.extras],
        ].map(([label, value]) => (
          <div key={label} className="bg-muted/50 grid gap-1 rounded-md p-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground text-sm">{monthlyClientReportDisclaimer}</p>
      {entries.length ? (
        <ol start={current * previewPageSize + 1} className="divide-border divide-y text-sm">
          {entries
            .slice(current * previewPageSize, (current + 1) * previewPageSize)
            .map((entry) => (
              <li key={entry.key} className="py-2.5 wrap-anywhere">
                <p className="font-medium">
                  {entry.type} · {entry.title}
                </p>
                <p className="text-muted-foreground">
                  {entry.dateLabel}: {monthlyReportDateLabel(entry.date)} · {entry.centre} ·{' '}
                  {entry.stateLabel}
                  {'quantityLabel' in entry ? ` · ${entry.quantityLabel}` : null}
                </p>
              </li>
            ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">
          No hay visitas ni extras en este mes y centro.
        </p>
      )}
      {pages > 1 ? (
        <nav aria-label="Páginas de la vista previa" className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            isDisabled={current === 0}
            onPress={() => setPage(current - 1)}
          >
            Anterior
          </Button>
          <output className="text-sm">
            Página {current + 1} de {pages}
          </output>
          <Button
            variant="outline"
            className="min-h-11"
            isDisabled={current + 1 === pages}
            onPress={() => setPage(current + 1)}
          >
            Siguiente
          </Button>
        </nav>
      ) : null}
    </section>
  )
}
