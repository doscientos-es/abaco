import { Button } from '@doscientos/ui'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import {
  readAppointmentLink,
  respondToAppointmentLink,
  validAppointmentToken,
  type AppointmentResponse,
  type PublicAppointment,
} from '../application/appointment-link-actions'
import { formatAppointmentTime } from '../domain/appointment-link'

function initialToken() {
  if (typeof window === 'undefined') return ''
  const token = window.location.hash.slice(1)
  return validAppointmentToken(token) ? token : ''
}

export function PublicAppointmentPage() {
  const [token, setToken] = useState(initialToken)
  const [attempt, setAttempt] = useState(0)
  const [view, setView] = useState<PublicAppointment | null>(null)
  const [failure, setFailure] = useState('')
  const [loading, setLoading] = useState(Boolean(token))
  const [proposing, setProposing] = useState(false)
  const [localStart, setLocalStart] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const lastClick = useRef(0)
  const outcome = useRef<HTMLHeadingElement>(null)

  const tokenScope = useRef(token)
  useLayoutEffect(() => {
    function scrubAddress() {
      if (window.location.pathname === '/cita' && (window.location.hash || window.location.search))
        window.history.replaceState(window.history.state, '', window.location.pathname)
    }
    function followNewFragment() {
      if (window.location.pathname !== '/cita' || !window.location.hash) return
      const next = initialToken()
      scrubAddress()
      tokenScope.current = next
      setToken(next)
      setLoading(Boolean(next))
      setFailure('')
      setView(null)
      setProposing(false)
      setLocalStart('')
      setAttempt((value) => value + 1)
    }
    scrubAddress()
    window.addEventListener('hashchange', followNewFragment)
    return () => window.removeEventListener('hashchange', followNewFragment)
  }, [])

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    void readAppointmentLink(token, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setView(data)
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setFailure('No se pudo comprobar el enlace. Reintenta cuando tengas conexión.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [attempt, token])

  useEffect(() => {
    if (view?.response) outcome.current?.focus()
  }, [view?.response])

  async function answer(response: AppointmentResponse) {
    if (submitting.current || Date.now() - lastClick.current < 1500 || !view || view.response)
      return
    if (response === 'change' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localStart)) {
      setFailure('Elige el nuevo día y hora.')
      return
    }
    lastClick.current = Date.now()
    submitting.current = true
    setBusy(true)
    setFailure('')
    try {
      const result = await respondToAppointmentLink(
        token,
        response,
        response === 'change' ? localStart : undefined,
      )
      if (tokenScope.current === token) setView(result)
    } catch (error) {
      if (tokenScope.current === token)
        setFailure(error instanceof Error ? error.message : 'No se pudo confirmar la respuesta.')
    } finally {
      setBusy(false)
      submitting.current = false
    }
  }

  return (
    <main className="bg-background mx-auto min-h-dvh max-w-lg px-4 py-8">
      <h1 className="text-2xl font-semibold">Tu cita</h1>
      <section className="border-border mt-4 space-y-4 rounded-xl border p-4">
        {loading ? <output className="text-sm">Comprobando el enlace…</output> : null}
        {failure ? (
          <p role="alert" className="text-destructive text-sm">
            {failure}
          </p>
        ) : null}
        {!loading && !view && failure && token ? (
          <Button
            type="button"
            className="min-h-11 w-full"
            onPress={() => {
              if (Date.now() - lastClick.current < 1500) return
              lastClick.current = Date.now()
              setLoading(true)
              setFailure('')
              setAttempt(attempt + 1)
            }}
          >
            Reintentar
          </Button>
        ) : null}
        {!loading && !view && !failure ? (
          <p>
            Este enlace no está disponible. Si quieres responder, contacta con quien te lo envió.
          </p>
        ) : null}
        {view ? (
          <>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="font-medium">Empieza</dt>
                <dd>{formatAppointmentTime(view.startAt, view.timezone)}</dd>
              </div>
              <div>
                <dt className="font-medium">Termina</dt>
                <dd>{formatAppointmentTime(view.endAt, view.timezone)}</dd>
              </div>
              <div>
                <dt className="font-medium">Zona horaria</dt>
                <dd>{view.timezone}</dd>
              </div>
            </dl>
            {view.response ? (
              <div className="bg-muted space-y-2 rounded-lg p-3">
                <h2 tabIndex={-1} ref={outcome} className="font-semibold">
                  {view.response === 'confirmed'
                    ? 'Asistencia confirmada'
                    : view.declined
                      ? 'Propuesta no aceptada'
                      : 'Propuesta registrada'}
                </h2>
                {view.declined ? (
                  <p className="text-sm">
                    La propuesta no cambió la cita. Contacta con quien te envió el enlace si
                    necesitas un horario distinto.
                  </p>
                ) : view.proposedAt ? (
                  <p className="text-sm">
                    Has propuesto {formatAppointmentTime(view.proposedAt, view.timezone)}. La cita
                    no cambia hasta que la oficina la confirme.
                  </p>
                ) : (
                  <p className="text-sm">
                    Tu respuesta se ha registrado. Se mantiene el horario de la cita.
                  </p>
                )}
              </div>
            ) : proposing ? (
              <form
                className="grid gap-3"
                aria-busy={busy}
                onSubmit={(event) => {
                  event.preventDefault()
                  void answer('change')
                }}
              >
                <label className="grid gap-1 text-sm font-medium">
                  Nuevo día y hora ({view.timezone})
                  <input
                    type="datetime-local"
                    required
                    value={localStart}
                    disabled={busy}
                    className="border-input bg-background min-h-11 w-full min-w-0 rounded-md border px-2 py-2 text-base"
                    onChange={(event) => setLocalStart(event.currentTarget.value)}
                  />
                </label>
                <p className="text-muted-foreground text-sm">
                  Enviar la propuesta no cambia la cita.
                </p>
                <Button type="submit" className="min-h-11" isDisabled={busy || !localStart}>
                  Enviar propuesta
                </Button>
                <Button
                  type="button"
                  className="min-h-11"
                  variant="outline"
                  isDisabled={busy}
                  onPress={() => setProposing(false)}
                >
                  Volver
                </Button>
              </form>
            ) : (
              <div className="grid gap-2">
                <Button
                  type="button"
                  className="min-h-11"
                  isDisabled={busy}
                  onPress={() => void answer('confirmed')}
                >
                  Confirmar asistencia
                </Button>
                <Button
                  type="button"
                  className="min-h-11"
                  variant="outline"
                  isDisabled={busy}
                  onPress={() => setProposing(true)}
                >
                  Proponer otro horario
                </Button>
              </div>
            )}
          </>
        ) : null}
      </section>
    </main>
  )
}
