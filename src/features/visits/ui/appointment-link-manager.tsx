import { Button, ConfirmDialog } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  appointmentLinkUrl,
  createAppointmentLinkAttempt,
  issueAppointmentLink,
  listAppointmentLinks,
  revokeAppointmentLink,
  type AppointmentExpiry,
} from '../application/appointment-link-actions'
import { formatAppointmentTime } from '../domain/appointment-link'
import { useAppointmentClock } from './use-appointment-clock'

export function AppointmentLinkManager({
  tenantId,
  visitId,
  revision,
  timezone,
  onClose,
}: {
  tenantId: string
  visitId: string
  revision: string
  timezone: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const links = useQuery({
    queryKey: ['visit-appointment-links', tenantId, visitId],
    queryFn: () => listAppointmentLinks(tenantId, visitId),
    retry: false,
  })
  const [expiry, setExpiry] = useState<AppointmentExpiry>(72)
  const [url, setUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState(false)
  const inFlight = useRef(false)
  const attempt = useRef<ReturnType<typeof createAppointmentLinkAttempt> | null>(null)
  const now = useAppointmentClock()
  const latest = links.data?.[0]
  const current = latest?.visit_revision === revision
  const live = latest && current && !latest.revoked_at && Date.parse(latest.expires_at) > now
  const blocked =
    current &&
    (latest?.response === 'confirmed' || (latest?.response === 'change' && !latest.office_decision))

  async function perform(task: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFailure('')
    setNotice('')
    try {
      await task()
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'No se pudo confirmar la operación.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  function create() {
    void perform(async () => {
      setUrl('')
      const pending =
        attempt.current?.hours === expiry ? attempt.current : createAppointmentLinkAttempt(expiry)
      attempt.current = pending
      const validUntil = await issueAppointmentLink(tenantId, visitId, pending)
      setUrl(appointmentLinkUrl(window.location.origin, pending.token))
      attempt.current = null
      setNotice(`Enlace creado. Caduca el ${formatAppointmentTime(validUntil, timezone)}.`)
      await queryClient.invalidateQueries({
        queryKey: ['visit-appointment-links', tenantId, visitId],
      })
    })
  }

  function revoke() {
    if (!latest) return
    void perform(async () => {
      await revokeAppointmentLink(tenantId, latest.id)
      setUrl('')
      setPendingRevoke(false)
      setNotice('Enlace revocado.')
      attempt.current = null
      await queryClient.invalidateQueries({
        queryKey: ['visit-appointment-links', tenantId, visitId],
      })
    })
  }

  return (
    <section
      className="border-border mt-3 min-w-0 space-y-3 rounded-lg border p-4"
      aria-label="Enlace de cita"
    >
      <h3 className="font-semibold">Enlace para responder a la cita</h3>
      <p className="text-muted-foreground text-sm">
        Cópialo y compártelo solo con quien deba responder. No se enviará nada automáticamente.
      </p>
      {links.isPending ? <output className="text-sm">Comprobando enlaces…</output> : null}
      {links.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron comprobar los enlaces.{' '}
          <Button type="button" variant="outline" onPress={() => void links.refetch()}>
            Reintentar
          </Button>
        </p>
      ) : null}
      {latest && current && latest.response ? (
        <p className="text-sm">
          {latest.response === 'confirmed'
            ? 'Asistencia confirmada por el cliente'
            : latest.office_decision === 'declined'
              ? 'Propuesta descartada por oficina'
              : 'Solicitud de cambio registrada'}
        </p>
      ) : null}
      {latest && live ? (
        <p className="text-sm">
          Caduca el {formatAppointmentTime(latest.expires_at, latest.timezone)}.
        </p>
      ) : null}
      {latest && !current ? (
        <p className="text-sm">El horario cambió. Los enlaces anteriores ya no sirven.</p>
      ) : null}
      {links.isSuccess && !blocked ? (
        <>
          <label className="grid max-w-xs gap-1 text-sm">
            Validez máxima
            <select
              value={expiry}
              disabled={busy}
              onChange={(event) => {
                const value = Number(event.currentTarget.value)
                if (value === 24 || value === 72 || value === 168) setExpiry(value)
              }}
              className="border-input bg-background min-h-11 rounded-md border px-2 text-base"
            >
              <option value={24}>24 horas</option>
              <option value={72}>3 días</option>
              <option value={168}>7 días</option>
            </select>
          </label>
          <p className="text-muted-foreground text-xs">
            El enlace caduca como máximo al empezar la cita.
          </p>
          <Button type="button" className="min-h-11" isDisabled={busy} onPress={create}>
            {live ? 'Crear otro e invalidar el anterior' : 'Crear enlace'}
          </Button>
        </>
      ) : null}
      {url ? (
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-sm">
            Enlace listo para copiar
            <input
              readOnly
              value={url}
              className="border-input bg-background min-h-11 w-full min-w-0 rounded-md border px-2 text-base"
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onPress={() => {
              void perform(async () => {
                await navigator.clipboard.writeText(url)
                setNotice('Enlace copiado. No se ha enviado.')
              })
            }}
          >
            Copiar enlace
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {live ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            isDisabled={busy}
            onPress={() => setPendingRevoke(true)}
          >
            Revocar enlace
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          isDisabled={busy}
          onPress={() => {
            setUrl('')
            onClose()
          }}
        >
          Cerrar enlace de cita
        </Button>
      </div>
      {failure ? (
        <p role="alert" className="text-destructive text-sm">
          {failure}
        </p>
      ) : null}
      {notice ? <output className="text-sm">{notice}</output> : null}
      <ConfirmDialog
        open={pendingRevoke}
        onOpenChange={(next) => {
          if (!busy) setPendingRevoke(next)
        }}
        title="¿Revocar el enlace de esta cita?"
        description="Quien lo tenga ya no podrá usarlo. La visita y cualquier respuesta registrada se mantienen."
        confirmLabel="Revocar enlace"
        onConfirm={revoke}
      />
    </section>
  )
}
