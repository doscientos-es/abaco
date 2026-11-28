import { useEffect, useState } from 'react'

import { decodePortalSnapshot, portalApi, type PortalSnapshot } from '../domain/customer-portal'
import { CustomerPortalContent, formatPortalDate } from './customer-portal-content'

type State = { kind: 'loading' | 'gone' | 'error' } | { kind: 'ready'; data: PortalSnapshot }

export function CustomerPortalPage({ token }: { token: string | null }) {
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<State>(token ? { kind: 'loading' } : { kind: 'gone' })

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(portalApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (response.status === 404) return setState({ kind: 'gone' })
        if (!response.ok) return setState({ kind: 'error' })
        const value: unknown = await response.json()
        if (controller.signal.aborted) return
        const data = decodePortalSnapshot(value)
        if (!data) return setState({ kind: 'error' })
        setState(
          Date.parse(data.expiresAt) > Date.now() ? { kind: 'ready', data } : { kind: 'gone' },
        )
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      }
    })()
    return () => controller.abort()
  }, [request, token])

  useEffect(() => {
    if (state.kind !== 'ready') return
    const timer = window.setTimeout(
      () => setState({ kind: 'gone' }),
      Math.max(0, Date.parse(state.data.expiresAt) - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [state])

  function refresh() {
    setState({ kind: 'loading' })
    setRequest((count) => count + 1)
  }

  // Entries restored from the browser back/forward cache must check revocation again.
  useEffect(() => {
    if (!token) return
    const onRestore = (event: PageTransitionEvent) => {
      if (event.persisted) refresh()
    }
    window.addEventListener('pageshow', onRestore)
    return () => window.removeEventListener('pageshow', onRestore)
  }, [token])

  const status =
    state.kind === 'ready'
      ? 'Contenido compartido cargado.'
      : state.kind === 'loading'
        ? 'Comprobando el acceso…'
        : state.kind === 'gone'
          ? 'Este enlace no está disponible.'
          : 'No hemos podido consultar el contenido. Comprueba la conexión e inténtalo de nuevo.'
  return (
    <main className="ml-portal-main">
      <header>
        <img src="/menoslios-mark.svg" alt="Menos Líos" width="36" height="36" />
        <h1>Portal de cliente</h1>
        <p>Consulta solo el contenido que la empresa ha compartido contigo.</p>
      </header>
      <output className={state.kind === 'ready' ? 'ml-portal-sr-only' : undefined}>{status}</output>
      {state.kind === 'gone' ? (
        <p>
          Vuelve a abrir el enlace original. Si no funciona, pide uno nuevo a la empresa que te lo
          envió.
        </p>
      ) : null}
      {state.kind === 'ready' ? (
        <>
          <CustomerPortalContent visits={state.data.visits} documents={state.data.documents} />
          <p className="ml-portal-muted">
            Acceso hasta {formatPortalDate(state.data.expiresAt)} (hora peninsular).
          </p>
        </>
      ) : null}
      {token &&
      (state.kind === 'ready' ||
        state.kind === 'error' ||
        (state.kind === 'loading' && request > 0)) ? (
        <button
          type="button"
          aria-disabled={state.kind === 'loading'}
          onClick={() => {
            if (state.kind === 'loading') return
            refresh()
          }}
        >
          Actualizar
        </button>
      ) : null}
      <noscript>Activa JavaScript y vuelve a abrir el enlace original.</noscript>
    </main>
  )
}
