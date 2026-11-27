import { Badge, Button, ConfirmDialog } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { useSession } from '@/features/auth'

import {
  beginGoogleCalendarConnection,
  completeGoogleCalendarConnection,
  disconnectGoogleCalendar,
  GoogleCalendarAccessInactiveError,
  GoogleCalendarPermissionError,
  googleCalendarStatusQuery,
  queueGoogleCalendarSync,
} from '../application/google-calendar-actions'
import { IntegrationCard } from './integration-card'

const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
const connectionLabels = {
  connected: 'Conectado',
  disconnected: 'Sin conectar',
  provisioning: 'Preparando',
  reauthorize: 'Requiere acceso',
}
const disconnectDescription =
  'Menos Líos deja de sincronizar y elimina la credencial guardada. Los eventos siguen en tu calendario. Puedes borrar los eventos en Calendar y retirar el permiso desde tu cuenta de Google.'

function errorMessage(code: string | null | undefined) {
  if (code === 'reauthorize') return 'Google ha retirado el permiso. Vuelve a conectar tu cuenta.'
  if (code === 'calendar_conflict') return 'No se pudo confirmar un evento. Revisa tu calendario.'
  if (code === 'invalid_visit')
    return 'Hay una visita con horario no válido que no se ha sincronizado.'
  if (code === 'google_unavailable')
    return 'Google no está disponible ahora. Menos Líos volverá a intentarlo.'
  return null
}

export function GoogleCalendarSettings() {
  const session = useSession()
  const tenantId = session?.tenantId ?? ''
  const callback = useSearch({ from: '/ajustes' }).calendar
  const queryClient = useQueryClient()
  const status = useQuery(googleCalendarStatusQuery(tenantId))
  const [busy, setBusy] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const completing = useRef(false)
  const connection = status.data
  const connected = connection?.status === 'connected'
  const canConnect = Boolean(
    tenantId && !connected && !status.isPending && !status.isError && connection?.accessActive,
  )
  const reconnect = connection?.status === 'reauthorize'
  const statusLabel = status.isError
    ? 'Estado no disponible'
    : status.isPending
      ? 'Consultando…'
      : connectionLabels[connection?.status ?? 'disconnected']
  const syncError = errorMessage(connection?.lastError)
  const feedback =
    message ??
    (callback === 'connected' ? 'Tu cuenta de Google se ha conectado correctamente.' : null)

  useEffect(() => {
    if (!tenantId || completing.current || !window.location.hash.includes('calendar_')) return
    completing.current = true
    setBusy(true)
    void completeGoogleCalendarConnection(tenantId)
      .then(async (completed) => {
        if (!completed) return
        setMessage('Tu cuenta de Google se ha conectado correctamente.')
        await queryClient.invalidateQueries({
          queryKey: googleCalendarStatusQuery(tenantId).queryKey,
        })
      })
      .catch((error: unknown) =>
        setActionError(
          error instanceof GoogleCalendarAccessInactiveError
            ? error.message
            : 'No se pudo completar la conexión con Google. Vuelve a intentarlo.',
        ),
      )
      .finally(() => setBusy(false))
  }, [tenantId, queryClient])

  async function connect() {
    if (!canConnect || busy) return
    setBusy(true)
    setActionError(null)
    try {
      const url = await beginGoogleCalendarConnection(tenantId)
      window.location.assign(url)
    } catch (error) {
      setActionError(
        error instanceof GoogleCalendarAccessInactiveError
          ? error.message
          : 'No se pudo iniciar la conexión. Comprueba tu sesión e inténtalo de nuevo.',
      )
      setBusy(false)
    }
  }

  async function syncNow() {
    if (!tenantId || busy) return
    setBusy(true)
    setActionError(null)
    try {
      const queued = await queueGoogleCalendarSync(tenantId)
      setMessage(queued > 0 ? 'Sincronización solicitada.' : 'No hay visitas asignadas pendientes.')
      await queryClient.invalidateQueries({
        queryKey: googleCalendarStatusQuery(tenantId).queryKey,
      })
    } catch {
      setActionError('No se pudo solicitar la sincronización. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!tenantId || busy) return
    setBusy(true)
    setActionError(null)
    try {
      await disconnectGoogleCalendar(tenantId)
      setConfirmDisconnect(false)
      setMessage('Google Calendar se ha desconectado.')
      await queryClient.invalidateQueries({
        queryKey: googleCalendarStatusQuery(tenantId).queryKey,
      })
    } catch {
      setActionError('No se pudo desconectar Google Calendar. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <IntegrationCard
        name="Google Calendar"
        logo="/integrations/google-calendar-logo.svg"
        description="Sincroniza tus visitas asignadas con un calendario de tu cuenta."
        status={
          <Badge
            variant={
              status.isError ? 'neutral' : connected ? 'success' : reconnect ? 'warning' : 'neutral'
            }
          >
            {statusLabel}
          </Badge>
        }
        feedback={
          feedback ? (
            <output>{feedback}</output>
          ) : callback === 'error' ? (
            <p role="alert" className="text-destructive">
              Google no pudo completar la conexión.
            </p>
          ) : null
        }
        actionLabel={connected ? 'Gestionar' : reconnect ? 'Volver a conectar' : 'Conectar'}
        connectAction={!connected}
        dialogTitle={connected ? 'Google Calendar' : 'Conectar Google Calendar'}
        dialogActions={
          connected ? (
            <>
              <Button
                variant="outline"
                isDisabled={busy}
                onPress={() => {
                  setActionError(null)
                  setConfirmDisconnect(true)
                }}
              >
                Desconectar
              </Button>
              <Button
                isDisabled={!connection?.accessActive}
                isPending={busy}
                onPress={() => void syncNow()}
              >
                Sincronizar ahora
              </Button>
            </>
          ) : (
            <Button isDisabled={!canConnect} isPending={busy} onPress={() => void connect()}>
              Continuar con Google
            </Button>
          )
        }
      >
        <dl className="space-y-3">
          <div>
            <dt className="font-medium">Qué se sincroniza</dt>
            <dd className="text-muted-foreground">
              Solo el horario y un título genérico. No se envían nombres de clientes, direcciones,
              notas ni partes de trabajo. Los cambios en Google Calendar no modifican Menos Líos.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Tu calendario y las cuotas</dt>
            <dd className="text-muted-foreground">
              El calendario secundario queda en tu cuenta. La integración usa las cuotas de Menos
              Líos, no las de un proyecto tuyo. El uso estándar no tiene coste adicional dentro de
              los límites de Google.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Qué pasa al desconectar</dt>
            <dd className="text-muted-foreground">{disconnectDescription}</dd>
          </div>
        </dl>
        {connection?.accessActive === false ? (
          <p role="alert">
            La sincronización está en pausa porque la empresa no tiene acceso vigente.
          </p>
        ) : null}
        {status.isError ? (
          <div className="space-y-2">
            <p role="alert" className="text-destructive">
              {status.error instanceof GoogleCalendarPermissionError
                ? status.error.message
                : 'No se pudo consultar el estado de Google Calendar.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              isDisabled={busy}
              isPending={status.isFetching}
              onPress={() => void status.refetch()}
            >
              Reintentar consulta
            </Button>
          </div>
        ) : null}
        {connected || connection?.pendingJobs || connection?.lastSyncedAt || syncError ? (
          <div className="bg-muted text-muted-foreground space-y-1 rounded-lg p-3">
            {connection?.pendingJobs && connection.accessActive ? (
              <output>
                Sincronizando {connection.pendingJobs}{' '}
                {connection.pendingJobs === 1 ? 'visita' : 'visitas'}…
              </output>
            ) : connection?.pendingJobs ? (
              <p>Sincronizaciones pendientes: {connection.pendingJobs}.</p>
            ) : null}
            {connection?.lastSyncedAt ? (
              <p>
                Última sincronización:{' '}
                <time dateTime={connection.lastSyncedAt}>
                  {dateFormatter.format(new Date(connection.lastSyncedAt))}
                </time>
              </p>
            ) : connected ? (
              <p>Aún no hay ninguna sincronización registrada.</p>
            ) : null}
            {connected && connection?.pendingJobs === 0 ? (
              <p>No hay sincronizaciones pendientes.</p>
            ) : null}
            {syncError ? <p>{syncError}</p> : null}
          </div>
        ) : null}
        {!confirmDisconnect && actionError ? (
          <p role="alert" className="text-destructive">
            {actionError}
          </p>
        ) : null}
        {message ? <output>{message}</output> : null}
      </IntegrationCard>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="¿Desconectar Google Calendar?"
        description={
          <>
            {disconnectDescription}
            {actionError ? (
              <span role="alert" className="text-destructive mt-2 block">
                {actionError}
              </span>
            ) : null}
          </>
        }
        confirmLabel={busy ? 'Desconectando…' : 'Desconectar'}
        destructive
        pending={busy}
        onConfirm={() => void disconnect()}
      />
    </>
  )
}
