import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  downloadClosedReportPdf,
  listPendingReportReviews,
  reviewClosedReport,
} from '../application/report-review-actions'
import { loadClosedVisitReportVersion } from '../application/visit-report-actions'
import { ClosedVisitReport } from './closed-visit-report'

function usePendingReviews(tenantId: string, page: number) {
  return useQuery({
    queryKey: ['pending-report-reviews', tenantId, page],
    queryFn: () => listPendingReportReviews(tenantId, page),
    refetchInterval: 60_000,
  })
}

export function ReportReviewTabLabel({ tenantId }: { tenantId: string }) {
  const query = usePendingReviews(tenantId, 0)
  const count = query.data?.items.length ?? 0
  return (
    <>
      Partes por revisar
      {count > 0 ? (
        <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-xs">
          <span className="sr-only">Pendientes: </span>
          {count}
          {query.data?.hasMore ? '+' : ''}
        </span>
      ) : null}
    </>
  )
}

export function ReportReviewInbox({ tenantId }: { tenantId: string }) {
  const client = useQueryClient()
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const query = usePendingReviews(tenantId, page)
  const selected = query.data?.items.find((item) => item.report_version_id === openId)
  const openedReport = useQuery({
    queryKey: [
      'closed-visit-report-version',
      tenantId,
      selected?.visit_id,
      selected?.report_version_id,
    ],
    enabled: Boolean(selected),
    queryFn: () => {
      if (!selected) throw new Error('Parte no seleccionado')
      return loadClosedVisitReportVersion(tenantId, selected.visit_id, selected.report_version_id)
    },
  })

  async function review(id: string) {
    if (busy) return
    setBusy(true)
    try {
      await reviewClosedReport(tenantId, id)
      setOpenId(null)
      setPage(0)
      await client.invalidateQueries({ queryKey: ['pending-report-reviews', tenantId] })
      toast.success('Parte marcado como revisado')
    } catch {
      toast.error('No se pudo confirmar la revisión. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  async function download(id: string) {
    if (busy) return
    setBusy(true)
    try {
      const pdf = await downloadClosedReportPdf(tenantId, id)
      const url = URL.createObjectURL(pdf)
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = `parte-${id}.pdf`
        link.click()
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch {
      toast.error('El PDF aún no está disponible o no se pudo descargar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="border-border bg-card space-y-3 rounded-lg border p-4"
      aria-label="Partes pendientes de revisión"
    >
      <div>
        <h2 className="font-semibold">Partes pendientes de revisión</h2>
        <p className="text-muted-foreground text-sm">
          Revisa las versiones cerradas y marca cada una cuando hayas terminado. Incluye partes
          anteriores.
        </p>
      </div>
      {query.isPending ? <p>Cargando partes…</p> : null}
      {query.isError ? <p role="alert">No se pudieron cargar los partes pendientes.</p> : null}
      {query.isSuccess && !query.data.items.length ? (
        <p>No hay partes pendientes en esta página.</p>
      ) : null}
      <ul className="space-y-3">
        {query.data?.items.map((report) => (
          <li
            key={report.report_version_id}
            className="border-border space-y-3 rounded-lg border p-3"
          >
            <p className="text-sm font-medium">
              {report.visit_title || 'Visita'} · {report.client_name || 'Cliente'} · versión{' '}
              {report.version}
            </p>
            <p className="text-muted-foreground text-xs">
              Cerrado el {new Date(report.closed_at).toLocaleString('es-ES')}
            </p>
            <Button
              variant="outline"
              size="sm"
              onPress={() =>
                setOpenId(openId === report.report_version_id ? null : report.report_version_id)
              }
            >
              {openId === report.report_version_id ? 'Ocultar parte' : 'Revisar parte'}
            </Button>
            {openId === report.report_version_id ? (
              <div className="space-y-3">
                <ClosedVisitReport
                  tenantId={tenantId}
                  visitId={report.visit_id}
                  versionId={report.report_version_id}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={busy}
                    onPress={() => void download(report.report_version_id)}
                  >
                    Descargar PDF
                  </Button>
                  <Button
                    size="sm"
                    isDisabled={busy || !openedReport.data}
                    onPress={() => void review(report.report_version_id)}
                  >
                    Marcar como revisado
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {page > 0 || query.data?.hasMore ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            isDisabled={page === 0 || busy}
            onPress={() => {
              setOpenId(null)
              setPage(page - 1)
            }}
          >
            Anterior
          </Button>
          <span className="text-sm">Página {page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={!query.data?.hasMore || busy}
            onPress={() => {
              setOpenId(null)
              setPage(page + 1)
            }}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </section>
  )
}
