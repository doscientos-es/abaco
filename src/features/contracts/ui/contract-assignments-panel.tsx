import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'

import { loadContractSignatureSetup } from '../application/contract-signature-actions'

export function ContractAssignmentsPanel({
  tenantId,
  contractId,
}: {
  tenantId: string
  contractId: string
}) {
  const query = useQuery({
    queryKey: ['contract-assignment-setup', tenantId, contractId],
    queryFn: () => loadContractSignatureSetup(tenantId, contractId),
  })
  const setup = query.data
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Responsables al firmar">
      <h2 className="text-lg font-semibold">Responsables al firmar</h2>
      <p className="text-muted-foreground text-sm">
        Asignaciones acordadas al registrar la firma. La programación de visitas se gestiona en cada
        trabajo.
      </p>
      {query.isPending ? <output>Cargando asignaciones…</output> : null}
      {query.isError ? (
        <div role="alert">
          <p>No se pudieron cargar las asignaciones.</p>
          <Button variant="outline" onPress={() => void query.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {setup && !setup.assignments.length ? (
        <p className="text-muted-foreground text-sm">
          Este contrato se firmó antes de incorporar la asignación por tareas.
        </p>
      ) : null}
      {setup?.assignments.length ? (
        <div className="overflow-x-auto">
          <table
            className="w-full text-left text-sm"
            aria-label="Asignaciones de trabajos y tareas"
          >
            <thead>
              <tr className="border-b">
                <th className="p-2">Trabajo o tarea</th>
                <th className="p-2">Trabajo asociado</th>
                <th className="p-2">Responsables</th>
              </tr>
            </thead>
            <tbody>
              {setup.assignments.map((assignment) => {
                const job = setup.jobs.find((item) => item.id === assignment.job_id)
                const task = setup.tasks.find((item) => item.task_key === assignment.task_key)
                const responsible = assignment.work_team_id
                  ? (setup.teams.find((team) => team.id === assignment.work_team_id)?.name ??
                    'Equipo no disponible')
                  : assignment.assigned_user_ids
                      .map(
                        (id) =>
                          setup.people.find((person) => person.id === id)?.label ??
                          'Persona no disponible',
                      )
                      .join(', ')
                return (
                  <tr key={assignment.task_key} className="border-b last:border-0">
                    <td className="p-2">{task?.title ?? job?.title ?? 'Trabajo no disponible'}</td>
                    <td className="p-2">{job?.title ?? 'Trabajo no disponible'}</td>
                    <td className="p-2">{responsible}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
