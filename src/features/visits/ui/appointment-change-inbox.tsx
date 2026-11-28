import { Button, ConfirmDialog } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  decideAppointmentChange,
  listAppointmentChangeRequests,
  type AppointmentChangeRequest,
  type AppointmentDecision,
} from '../application/appointment-link-actions'
import { formatAppointmentTime } from '../domain/appointment-link'
import { useAppointmentClock } from './use-appointment-clock'

export function AppointmentChangeInbox({
  tenantId,
  onSaved,
}: {
  tenantId: string
  onSaved: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [decision, setDecision] = useState<{
    row: AppointmentChangeRequest
    value: AppointmentDecision
    operationId: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const inFlight = useRef(false)
  const now = useAppointmentClock(open)
  const queryClient = useQueryClient()
  const requests = useQuery({
    queryKey: ['appointment-change-requests', tenantId, page],
    queryFn: () => listAppointmentChangeRequests(tenantId, page),
    enabled: open,
    retry: false,
  })

  async function decide() {
    if (!decision || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFailure('')
    setNotice('')
    try {
      await decideAppointmentChange(tenantId, decision.row.id, decision.value, decision.operationId)
      setDecision(null)
      setNotice(
        decision.value === 'approved'
          ? 'Horario actualizado. No se ha enviado ningún mensaje al cliente.'
          : 'Solicitud descartada. Se mantiene el horario.',
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['appointment-change-requests', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['visit-appointment-links', tenantId] }),
        onSaved(),
      ])
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'No se pudo confirmar la decisión.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <details
      className="border-border bg-card rounded-xl border"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer p-3 font-semibold">
        Solicitudes de cambio de cita
      </summary>
      {open ? (
        <section className="border-border space-y-3 border-t p-3">
          <p className="text-muted-foreground text-sm">
            Las propuestas no cambian la agenda. Revisa disponibilidad y confirma solo las que
            puedas atender.
          </p>
          {requests.isPending ? <output className="text-sm">Cargando solicitudes…</output> : null}
          {requests.isError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>No se pudieron comprobar las solicitudes.</p>
              <Button type="button" variant="outline" onPress={() => void requests.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : null}
          {requests.isSuccess && !requests.data.rows.length ? (
            <p className="text-sm">No hay solicitudes en esta página.</p>
          ) : null}
          <ul className="space-y-2">
            {requests.data?.rows.map((row) => {
              const current = row.service_visits
              const valid =
                current?.status === 'scheduled' &&
                current.updated_at === row.visit_revision &&
                row.proposed_start &&
                Date.parse(row.original_start) > now &&
                Date.parse(row.proposed_start) > now
              return (
                <li key={row.id} className="border-border space-y-2 rounded-lg border p-3">
                  <p className="font-medium break-words">{current?.title ?? 'Visita'}</p>
                  <p className="text-sm">
                    Actual: {formatAppointmentTime(row.original_start, row.timezone)}
                  </p>
                  {row.proposed_start ? (
                    <p className="text-sm">
                      Propuesta: {formatAppointmentTime(row.proposed_start, row.timezone)}
                    </p>
                  ) : null}
                  {!valid ? (
                    <p className="text-muted-foreground text-sm">
                      La solicitud ya no coincide con la visita programada.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="min-h-11"
                      isDisabled={!valid || busy}
                      onPress={() =>
                        setDecision({ row, value: 'approved', operationId: crypto.randomUUID() })
                      }
                    >
                      Revisar y confirmar
                    </Button>
                    <Button
                      type="button"
                      className="min-h-11"
                      variant="outline"
                      isDisabled={busy}
                      onPress={() =>
                        setDecision({ row, value: 'declined', operationId: crypto.randomUUID() })
                      }
                    >
                      Descartar propuesta
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
          {requests.isSuccess && (page > 0 || requests.data.hasNext) ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                isDisabled={page === 0}
                onPress={() => setPage(page - 1)}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                isDisabled={!requests.data.hasNext}
                onPress={() => setPage(page + 1)}
              >
                Siguiente
              </Button>
            </div>
          ) : null}
          {notice ? <output className="text-sm">{notice}</output> : null}
          {failure ? (
            <p role="alert" className="text-destructive text-sm">
              {failure}
            </p>
          ) : null}
          <ConfirmDialog
            open={decision !== null}
            onOpenChange={(next) => {
              if (!next && !busy) setDecision(null)
            }}
            title={
              decision?.value === 'approved'
                ? '¿Confirmar el cambio de cita?'
                : '¿Descartar la propuesta?'
            }
            description={
              decision?.value === 'approved' && decision.row.proposed_start
                ? `La visita pasa al ${formatAppointmentTime(decision.row.proposed_start, decision.row.timezone)}, con la misma duración y asignación. No se enviará un mensaje al cliente.`
                : 'Se mantiene la hora actual de la visita.'
            }
            confirmLabel={
              decision?.value === 'approved'
                ? 'Confirmar cambio en agenda'
                : 'Descartar sin cambiar agenda'
            }
            onConfirm={() => void decide()}
          />
        </section>
      ) : null}
    </details>
  )
}
