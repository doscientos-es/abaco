import { useQuery } from '@tanstack/react-query'

import { loadClosedVisitReport } from '../application/visit-report-actions'

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

export function ClosedVisitReport({ tenantId, visitId }: { tenantId: string; visitId: string }) {
  const closed = useQuery({
    queryKey: ['closed-visit-report', tenantId, visitId],
    queryFn: () => loadClosedVisitReport(tenantId, visitId),
  })
  if (closed.isPending) return <p>Cargando versión cerrada del parte…</p>
  if (closed.isError || !closed.data) {
    return (
      <p role="alert" className="text-destructive">
        No se pudo consultar la versión cerrada del parte.
      </p>
    )
  }
  const { snapshot, version, closed_at: closedAt } = closed.data
  return (
    <section className="border-primary/30 bg-primary/5 space-y-3 rounded-lg border p-4 text-sm">
      <div>
        <h3 className="font-semibold">Parte cerrado · versión {version}</h3>
        <p className="text-muted-foreground">
          {snapshot.client.name} · Cerrado el {new Date(closedAt).toLocaleString('es-ES')}
        </p>
        {snapshot.location ? (
          <p>
            {snapshot.location.name} · {snapshot.location.address}
          </p>
        ) : null}
      </div>
      <p className="whitespace-pre-line">
        {snapshot.report.data.notes || 'Sin notas de intervención'}
      </p>
      {snapshot.report.data.recommendations ? (
        <div>
          <h4 className="font-medium">Recomendaciones</h4>
          <p className="whitespace-pre-line">{snapshot.report.data.recommendations}</p>
        </div>
      ) : null}
      {snapshot.report.data.next_actions ? (
        <div>
          <h4 className="font-medium">Próximas actuaciones</h4>
          <p className="whitespace-pre-line">{snapshot.report.data.next_actions}</p>
        </div>
      ) : null}
      {snapshot.report.data.checklist.length ? (
        <div>
          <h4 className="font-medium">Comprobaciones</h4>
          <ul className="list-inside list-disc">
            {snapshot.report.data.checklist.map((item) => (
              <li key={item.id}>
                {item.done ? 'Hecha' : 'Pendiente'}: {item.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {snapshot.tasks.length ? (
        <div>
          <h4 className="font-medium">Tareas del trabajo</h4>
          <ul className="list-inside list-disc">
            {snapshot.tasks.map((task) => (
              <li key={task.id}>
                {task.phase} · {task.title} · {task.status}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {snapshot.measurements.length ? (
        <div>
          <h4 className="font-medium">Mediciones</h4>
          <ul className="list-inside list-disc">
            {snapshot.measurements.map((reading) => (
              <li key={reading.id}>
                {reading.label}: {reading.value} {reading.unit} ·{' '}
                {assessmentLabels[reading.assessment] ?? reading.assessment}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {snapshot.activities.length ? (
        <div>
          <h4 className="font-medium">Actividad y consumos</h4>
          <ul className="list-inside list-disc">
            {snapshot.activities.map((entry) => (
              <li key={entry.id}>
                {activityLabels[entry.kind] ?? entry.kind}: {entry.description} · {entry.quantity}{' '}
                {entry.unit}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {snapshot.incidents.length ? (
        <div>
          <h4 className="font-medium">Incidencias registradas</h4>
          <ul className="list-inside list-disc">
            {snapshot.incidents.map((incident) => (
              <li key={incident.id}>
                {incident.title} · {incident.status}
                {incident.resolution ? ` · ${incident.resolution}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Esta versión conserva los datos disponibles al completar la visita.
      </p>
    </section>
  )
}
