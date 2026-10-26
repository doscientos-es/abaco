import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import {
  getPublicVisitReportPdfUrl,
  loadPublicVisitReport,
} from '../application/public-visit-report-actions'

const phaseLabels: Record<string, string> = {
  before: 'Antes',
  after: 'Después',
  other: 'Otra evidencia',
}
const assessmentLabels: Record<string, string> = {
  below: 'Por debajo del rango',
  within: 'Dentro del rango',
  above: 'Por encima del rango',
  unconfigured: 'Sin rango configurado',
}
const activityLabels: Record<string, string> = {
  labor: 'Tiempo',
  travel: 'Desplazamiento',
  material: 'Material',
  spare: 'Repuesto',
  product: 'Producto',
  corrective_action: 'Acción correctora',
}

export function PublicVisitReportPage({ token }: { token: string }) {
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const report = useQuery({
    queryKey: ['public-visit-report', token],
    queryFn: () => loadPublicVisitReport(token),
    refetchInterval: 4 * 60_000,
    retry: false,
  })
  if (report.isPending) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p>Cargando el parte de visita…</p>
      </main>
    )
  }
  if (report.isError) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Enlace no disponible</h1>
        <p role="alert" className="mt-3">
          El informe ha caducado, fue revocado o el enlace no es válido. Solicita uno nuevo a la
          empresa.
        </p>
      </main>
    )
  }
  const value = report.data
  async function downloadPdf() {
    if (pdfBusy) return
    setPdfBusy(true)
    setPdfError('')
    try {
      window.location.assign(await getPublicVisitReportPdfUrl(token))
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'No se pudo preparar el PDF.')
    } finally {
      setPdfBusy(false)
    }
  }
  return (
    <main className="bg-background text-foreground min-h-screen px-4 py-8 print:p-0">
      <article className="border-border mx-auto max-w-3xl space-y-7 rounded-xl border bg-white p-5 shadow-sm sm:p-9 print:border-0 print:shadow-none">
        <header className="border-primary space-y-2 border-t-4 pt-5">
          <p className="text-primary text-sm font-semibold tracking-wide uppercase">
            {value.company.name}
          </p>
          <h1 className="text-3xl font-semibold">Parte de visita</h1>
          <p className="text-muted-foreground text-sm">
            Versión {value.version} · Cerrado el {new Date(value.closedAt).toLocaleString('es-ES')}
          </p>
          <Button
            size="sm"
            variant="outline"
            isDisabled={pdfBusy}
            onPress={() => void downloadPdf()}
          >
            {pdfBusy ? 'Preparando PDF…' : 'Descargar PDF'}
          </Button>
          {pdfError ? (
            <p role="alert" className="text-destructive text-sm">
              {pdfError}
            </p>
          ) : null}
        </header>
        <section
          className="bg-primary/5 grid gap-3 rounded-lg p-4 text-sm sm:grid-cols-2"
          aria-label="Datos de la visita"
        >
          <div>
            <p className="text-muted-foreground">Cliente</p>
            <p className="font-medium">{value.client.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Intervención</p>
            <p className="font-medium">{value.visit.title}</p>
          </div>
          {value.location ? (
            <div>
              <p className="text-muted-foreground">Ubicación</p>
              <p>
                {value.location.name} · {value.location.address}
              </p>
            </div>
          ) : null}
          {value.asset ? (
            <div>
              <p className="text-muted-foreground">Instalación</p>
              <p>{value.asset.name}</p>
            </div>
          ) : null}
          {value.visit.actualStartAt ? (
            <div>
              <p className="text-muted-foreground">Inicio</p>
              <p>{new Date(value.visit.actualStartAt).toLocaleString('es-ES')}</p>
            </div>
          ) : null}
          {value.visit.actualEndAt ? (
            <div>
              <p className="text-muted-foreground">Fin</p>
              <p>{new Date(value.visit.actualEndAt).toLocaleString('es-ES')}</p>
            </div>
          ) : null}
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Resumen</h2>
          <p className="whitespace-pre-line">
            {value.report.notes || 'Sin notas de intervención.'}
          </p>
        </section>
        {value.report.checklist.length ? (
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Comprobaciones</h2>
            <ul className="space-y-1">
              {value.report.checklist.map((item, index) => (
                <li key={`${item.label}-${index}`}>
                  {item.done ? '✓ Hecha' : 'Pendiente'} · {item.label}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {value.measurements.length ? (
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Mediciones</h2>
            <ul className="divide-border divide-y">
              {value.measurements.map((reading, index) => (
                <li
                  key={`${reading.label}-${index}`}
                  className="flex flex-wrap justify-between gap-2 py-2"
                >
                  <span>
                    {reading.label}: {reading.value ?? '—'} {reading.unit}
                  </span>
                  <span className="text-muted-foreground">
                    {assessmentLabels[reading.assessment] ?? reading.assessment}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {value.activities.length ? (
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Trabajos realizados</h2>
            <ul className="space-y-1">
              {value.activities.map((entry, index) => (
                <li key={`${entry.kind}-${index}`}>
                  {activityLabels[entry.kind] ?? entry.kind}: {entry.description} ·{' '}
                  {entry.quantity ?? '—'} {entry.unit}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {value.incidents.length ? (
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Incidencias</h2>
            <ul className="space-y-1">
              {value.incidents.map((incident, index) => (
                <li key={`${incident.title}-${index}`}>
                  {incident.title}
                  {incident.resolution ? ` · ${incident.resolution}` : ''}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {value.photos.length ? (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Fotografías</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {value.photos.map((photo, index) => (
                <li
                  key={`${photo.phase}-${index}`}
                  className="border-border overflow-hidden rounded-lg border"
                >
                  <img
                    src={photo.url}
                    alt={photo.caption || `Fotografía ${phaseLabels[photo.phase] ?? ''}`}
                    className="aspect-video w-full object-cover"
                    loading="lazy"
                  />
                  <p className="p-2 text-sm">
                    {phaseLabels[photo.phase] ?? 'Evidencia'}
                    {photo.caption ? ` · ${photo.caption}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {value.report.recommendations ? (
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Recomendaciones</h2>
            <p className="whitespace-pre-line">{value.report.recommendations}</p>
          </section>
        ) : null}
        {value.report.nextActions ? (
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Próximas actuaciones</h2>
            <p className="whitespace-pre-line">{value.report.nextActions}</p>
          </section>
        ) : null}
        <footer className="border-border text-muted-foreground border-t pt-4 text-xs">
          Informe de la visita cerrada. Para aclaraciones, contacta con {value.company.name}.
        </footer>
      </article>
    </main>
  )
}
