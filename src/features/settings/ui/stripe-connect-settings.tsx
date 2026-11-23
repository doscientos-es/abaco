import { Button, Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { beginStripeConnection, stripeConnectionQuery } from '../application/stripe-connect-actions'

export function StripeConnectSettings({ tenantId }: { tenantId: string }) {
  const callback = useSearch({ from: '/ajustes' }).stripe
  const status = useQuery(stripeConnectionQuery(tenantId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      window.location.assign(await beginStripeConnection(tenantId))
    } catch {
      setError('No se pudo conectar con Stripe. Comprueba tu sesión e inténtalo de nuevo.')
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stripe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>Vincula la cuenta Stripe de esta empresa para preparar los cobros a sus clientes.</p>
        <p className="text-muted-foreground">
          Los cobros con Stripe todavía no están disponibles, incluso si conectas la cuenta.
        </p>
        {status.isPending ? <p>Consultando conexión…</p> : null}
        {status.isError ? (
          <p role="alert">No se pudo consultar Stripe. Inténtalo de nuevo más tarde.</p>
        ) : null}
        {status.data ? (
          <p>
            {status.data.connected ? 'Cuenta vinculada' : 'Sin cuenta vinculada'}
            {!status.data.liveMode ? ' · Modo de pruebas' : ''}
          </p>
        ) : null}
        {callback === 'error' ? (
          <p role="alert">No se pudo completar la conexión con Stripe.</p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        {status.data && !status.data.connected ? (
          <Button isDisabled={busy} onPress={() => void connect()}>
            {busy ? 'Conectando…' : 'Conectar Stripe'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
