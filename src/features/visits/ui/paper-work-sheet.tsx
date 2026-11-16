import type { MyDayTask } from '../application/my-day-tasks'
import type { PaperSnapshot } from '../application/paper-visit-actions'
import type { VisitSummary } from '../application/visit-actions'

/** Shared by individual and batch printing. No commercial or employment data. */
export function PaperWorkSheet({
  visit,
  snapshot,
  tasks,
}: {
  visit: VisitSummary
  snapshot: PaperSnapshot
  tasks?: MyDayTask[]
}) {
  return (
    <article className="paper-sheet space-y-4">
      <h1 className="text-xl font-semibold">Parte de trabajo · {visit.id}</h1>
      <p>
        Fecha prevista:{' '}
        {new Date(visit.scheduled_start_at).toLocaleDateString('es-ES', {
          timeZone: visit.timezone,
        })}
        {snapshot.timeKnown !== false
          ? ` · ${new Date(visit.scheduled_start_at).toLocaleTimeString('es-ES', { timeZone: visit.timezone, hour: '2-digit', minute: '2-digit' })}`
          : ' · Sin horario fijo'}
      </p>
      <h2 className="text-lg font-semibold">
        {snapshot.client || visit.client_name} · {snapshot.center || visit.location_name}
      </h2>
      <p>{snapshot.address || visit.address}</p>
      <p>
        <strong>{visit.title}</strong>
      </p>
      <p>Equipo/persona: {visit.work_team_name || visit.assigned_user_name || 'Sin asignar'}</p>
      <section className="whitespace-pre-wrap">
        <h3 className="font-semibold">Tareas y alcance</h3>
        {tasks !== undefined ? (
          <p>Los trabajos indicados se consideran realizados, salvo las incidencias anotadas.</p>
        ) : null}
        {snapshot.tasks ? <p>{snapshot.tasks}</p> : null}
        {snapshot.scheduledTasks?.map((task, index) => (
          <p key={`${index}:${task.title}`}>{task.title}</p>
        ))}
        {tasks?.map((task) => (
          <div key={task.id}>
            <p>{task.title}</p>
            {task.notes ? <p>{task.notes}</p> : null}
            {task.checklist.map((item) => (
              <p key={item.id}>- {item.label}</p>
            ))}
          </div>
        ))}
        {!snapshot.tasks && !snapshot.scheduledTasks?.length && !tasks?.length ? visit.title : null}
      </section>
      <section className="whitespace-pre-wrap">
        <h3 className="font-semibold">Acceso, contacto e instrucciones</h3>
        {snapshot.instructions || visit.notes || 'Sin indicaciones adicionales'}
      </section>
      <section>
        <h3 className="font-semibold">Trabajo realizado e incidencias</h3>
        <div className="min-h-32 border-b" />
      </section>
      <p>Fecha de realización: __________________________</p>
      {tasks !== undefined || snapshot.requiresAcceptance !== false ? (
        <section className="space-y-4">
          <h3 className="font-semibold">Conformidad del cliente</h3>
          <p>Nombre: ____________________________________</p>
          <div className="min-h-32 rounded border p-3">Firma y sello</div>
        </section>
      ) : null}
    </article>
  )
}
