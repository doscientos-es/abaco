import { Button } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { replanServiceVisit } from '@/features/visits/application/visit-actions'

import { listVacationCoverage } from '../application/vacation-actions'

function localDateTime(instant: string, timezone: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(instant))
    .replace(' ', 'T')
}

function timeLabel(instant: string, timezone: string) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(instant))
}

export function VacationCoverage({
  tenantId,
  requestId,
  approved,
}: {
  tenantId: string
  requestId: string
  approved: boolean
}) {
  const queryClient = useQueryClient()
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})
  const coverage = useQuery({
    queryKey: ['vacation-coverage', tenantId, requestId],
    enabled: approved,
    queryFn: () => listVacationCoverage(tenantId, requestId),
  })
  const replan = useMutation({
    mutationFn: async (input: {
      visitId: string
      expectedUpdatedAt: string
      localStart: string
      durationMinutes: number
      assignedUserId: string
    }) =>
      replanServiceVisit({
        tenantId,
        ...input,
        reason: 'Cobertura de vacaciones aprobadas',
        operationId: crypto.randomUUID(),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['vacation-coverage', tenantId, requestId] }),
        queryClient.invalidateQueries({ queryKey: ['office-visits', tenantId] }),
      ])
    },
  })

  if (!approved) {
    return (
      <p className="text-muted-foreground border-t pt-3 text-sm">
        Al aprobar, la agenda marcará los servicios afectados. No se reasignarán automáticamente.
      </p>
    )
  }

  return (
    <section className="border-t pt-3" aria-label="Servicios afectados y cobertura">
      <h3 className="font-medium">Servicios afectados</h3>
      {coverage.isPending ? <p className="text-muted-foreground mt-2">Revisando agenda…</p> : null}
      {coverage.isError ? (
        <p role="alert" className="text-destructive mt-2">{coverage.error.message}</p>
      ) : null}
      {coverage.data?.length === 0 ? (
        <p className="text-muted-foreground mt-2">No hay visitas futuras afectadas.</p>
      ) : null}
      <ul className="mt-2 space-y-3">
        {coverage.data?.map((visit) => {
          const duration = Math.round(
            (Date.parse(visit.scheduledEndAt) - Date.parse(visit.scheduledStartAt)) / 60_000,
          )
          return (
            <li key={visit.visitId} className="bg-muted/30 rounded-md border p-3">
              <p className="font-medium">{visit.title} · {visit.clientName}</p>
              <p className="text-muted-foreground">
                {timeLabel(visit.scheduledStartAt, visit.timezone)}–{timeLabel(visit.scheduledEndAt, visit.timezone)}
                {' · '}{visit.assignedUserName}
                {visit.locationName ? ` · ${visit.locationName}` : ''}
                {visit.workTeamName ? ` · Equipo ${visit.workTeamName}` : ''}
              </p>
              {visit.candidates.length ? (
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium">Posibles coberturas</p>
                  {visit.candidates.map((candidate) => {
                    const key = `${visit.visitId}:${candidate.userId}`
                    const isPending = replan.isPending && replan.variables?.visitId === visit.visitId
                    return (
                      <div key={key} className="space-y-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span>{candidate.label}</span>
                            <span className="text-muted-foreground"> · {candidate.workTeamMatch ? 'mismo equipo' : 'sin equipo asignado'}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            isDisabled={!confirmed[key] || replan.isPending}
                            onPress={() =>
                              replan.mutate({
                                visitId: visit.visitId,
                                expectedUpdatedAt: visit.updatedAt,
                                localStart: localDateTime(visit.scheduledStartAt, visit.timezone),
                                durationMinutes: duration,
                                assignedUserId: candidate.userId,
                              })
                            }
                          >
                            {isPending ? 'Guardando…' : 'Asignar y registrar cambio'}
                          </Button>
                        </div>
                        <label className="text-muted-foreground flex w-full items-start gap-2">
                          <input
                            type="checkbox"
                            checked={confirmed[key] ?? false}
                            onChange={(event) => setConfirmed((current) => ({ ...current, [key]: event.target.checked }))}
                          />
                          He comprobado manualmente que tiene las competencias y el horario adecuados.
                        </label>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">
                  No hay sustitutos disponibles según equipo, agenda y vacaciones. Habrá que cubrirlo manualmente.
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {replan.isError ? (
        <p role="alert" className="text-destructive mt-2 text-sm">
          No se pudo asignar. La visita puede haber cambiado o el técnico ya no estar disponible: {replan.error.message}
        </p>
      ) : null}
    </section>
  )
}
