import { Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog } from '@doscientos/ui'
import { CalendarCheck, GoogleLogo, WarningCircle } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { useSession } from '@/features/auth'

import {
  beginGoogleCalendarConnection,
  disconnectGoogleCalendar,
  googleCalendarStatusQuery,
  queueGoogleCalendarSync,
} from '../application/google-calendar-actions'

const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' })

function errorMessage(code: string | null | undefined) {
  if (code === 'reauthorize') return 'Google ha retirado el permiso. Vuelve a conectar tu cuenta.'
  if (code === 'calendar_conflict') return 'No se pudo confirmar un evento. Revisa tu calendario.'
  if (code === 'invalid_visit')
    return 'Hay una visita con horario no válido que no se ha sincronizado.'
  if (code === 'google_unavailable')
    return 'Google no está disponible ahora. Ábaco volverá a intentarlo.'
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
  const connection = status.data
  const connected = connection?.status === 'connected'

  async function connect() {
    if (!tenantId || busy) return
    setBusy(true)
    setActionError(null)
    try {
      const url = await beginGoogleCalendarConnection(tenantId)
      window.location.assign(url)
    } catch {
      setActionError('No se pudo iniciar la conexión. Comprueba tu sesión e inténtalo de nuevo.')
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
    <section aria-labelledby="integrations-heading" className="space-y-5">
      <div className="space-y-1">
        <h2 id="integrations-heading" className="text-lg font-semibold">
          Integraciones
        </h2>
        <p className="text-muted-foreground text-sm">
          Conecta tus herramientas con tu propia cuenta y decide cuándo retirar el acceso.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="bg-primary/5 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
              <CalendarCheck aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <CardTitle>Google Calendar</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Sincroniza las visitas que tienes asignadas con un calendario secundario de tu
                cuenta.
              </p>
            </div>
            {connection ? (
              <output
                className={
                  connected
                    ? 'bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-medium'
                    : 'bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-medium'
                }
              >
                {connection.status === 'connected'
                  ? 'Conectado'
                  : connection.status === 'provisioning'
                    ? 'Preparando'
                    : connection.status === 'reauthorize'
                      ? 'Requiere acceso'
                      : 'Desconectado'}
              </output>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-muted-foreground space-y-2 text-sm leading-relaxed">
            <p>
              Ábaco solo envía el título genérico y el horario; no sincroniza nombres de clientes,
              direcciones, notas ni partes de trabajo.
            </p>
            <p>
              La cuenta Google es tuya y conserva el calendario. Las llamadas usan las cuotas del
              proyecto de Ábaco: iniciar sesión con tu cuenta no traslada cuotas ni facturación a tu
              proyecto Google personal. El uso estándar de Calendar no tiene coste adicional dentro
              de los límites publicados por Google; consulta sus condiciones vigentes.
            </p>
          </div>

          {status.isPending ? (
            <p className="text-muted-foreground text-sm">Consultando conexión…</p>
          ) : null}
          {status.isError ? (
            <p role="alert" className="text-destructive text-sm">
              No se pudo consultar la conexión. Recarga la página para volver a intentarlo.
            </p>
          ) : null}
          {connection?.pendingJobs ? (
            <p className="text-muted-foreground text-sm" aria-live="polite">
              Sincronizando {connection.pendingJobs}{' '}
              {connection.pendingJobs === 1 ? 'visita' : 'visitas'}…
            </p>
          ) : null}
          {connection?.lastSyncedAt ? (
            <p className="text-muted-foreground text-sm">
              Última sincronización:{' '}
              <time dateTime={connection.lastSyncedAt}>
                {dateFormatter.format(new Date(connection.lastSyncedAt))}
              </time>
            </p>
          ) : null}
          {errorMessage(connection?.lastError) ? (
            <output className="text-muted-foreground flex items-start gap-2 text-sm">
              <WarningCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {errorMessage(connection?.lastError)}
            </output>
          ) : null}
          {callback === 'connected' ? (
            <output className="text-sm">Tu cuenta de Google se ha conectado correctamente.</output>
          ) : null}
          {callback === 'error' ? (
            <p role="alert" className="text-destructive text-sm">
              Google no pudo completar la conexión. Puedes intentarlo de nuevo.
            </p>
          ) : null}
          {message ? <output className="text-sm">{message}</output> : null}
          {actionError ? (
            <p role="alert" className="text-destructive text-sm">
              {actionError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!connected ? (
              <Button
                isDisabled={!tenantId || busy || status.isPending}
                onPress={() => void connect()}
              >
                <GoogleLogo aria-hidden="true" />
                {connection?.status === 'reauthorize'
                  ? 'Volver a conectar'
                  : 'Conectar Google Calendar'}
              </Button>
            ) : (
              <>
                <Button isDisabled={busy} onPress={() => void syncNow()}>
                  Sincronizar ahora
                </Button>
                <Button
                  variant="outline"
                  isDisabled={busy}
                  onPress={() => setConfirmDisconnect(true)}
                >
                  Desconectar
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs leading-relaxed">
        Al desconectar se elimina de Ábaco la credencial y se detiene la sincronización. Los eventos
        existentes no se borran ni se revoca automáticamente el permiso general de Google; puedes
        quitarlos desde Calendar y gestionar el acceso en la configuración de tu cuenta Google.
      </p>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="¿Desconectar Google Calendar?"
        description="Ábaco dejará de sincronizar tus visitas y eliminará la credencial guardada. Los eventos ya creados permanecerán en tu calendario."
        confirmLabel={busy ? 'Desconectando…' : 'Desconectar'}
        destructive
        pending={busy}
        onConfirm={() => void disconnect()}
      />
    </section>
  )
}
