import { Badge, Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { beginStripeConnection, stripeConnectionQuery } from '../application/stripe-connect-actions'
import { IntegrationCard } from './integration-card'

export function StripeConnectSettings({ tenantId }: { tenantId: string }) {
  const callback = useSearch({ from: '/ajustes' }).stripe
  const status = useQuery(stripeConnectionQuery(tenantId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connection = status.data
  const canConnect = connection?.connected === false
  const statusLabel = status.isError
    ? 'Estado no disponible'
    : status.isPending
      ? 'Consultando…'
      : connection?.connected
        ? 'Cuenta vinculada'
        : 'Sin conectar'

  async function connect() {
    if (!canConnect || busy) return
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
    <IntegrationCard
      name="Stripe"
      logo="/integrations/stripe-logo.svg"
      description="Vincula la cuenta de tu empresa para futuros cobros."
      status={
        <>
          <Badge variant={!status.isError && connection?.connected ? 'success' : 'neutral'}>
            {statusLabel}
          </Badge>
          {!status.isError && connection ? (
            <Badge variant={connection.liveMode ? 'neutral' : 'warning'}>
              {connection.liveMode ? 'Modo real' : 'Modo de pruebas'}
            </Badge>
          ) : null}
        </>
      }
      feedback={
        callback === 'error' ? (
          <p role="alert" className="text-destructive">
            No se pudo completar la conexión con Stripe.
          </p>
        ) : null
      }
      actionLabel={canConnect ? 'Conectar' : 'Ver detalles'}
      connectAction={canConnect}
      dialogTitle={canConnect ? 'Conectar Stripe' : 'Stripe'}
      dialogActions={
        canConnect ? (
          <Button isPending={busy} onPress={() => void connect()}>
            Continuar con Stripe
          </Button>
        ) : status.isError ? (
          <Button
            variant="outline"
            isPending={status.isFetching}
            onPress={() => void status.refetch()}
          >
            Reintentar consulta
          </Button>
        ) : null
      }
    >
      <div className="bg-muted rounded-lg p-3">
        <h3 className="font-medium">Cobros aún no disponibles</h3>
        <p className="text-muted-foreground mt-1">
          Conectar la cuenta no activa los cobros con Stripe en Ábaco.
        </p>
      </div>
      {connection?.connected && !status.isError ? (
        <p className="text-muted-foreground text-sm">
          La cuenta está vinculada. Por ahora no hay más opciones de configuración de Stripe en
          Ábaco.
        </p>
      ) : null}
      {status.isError ? (
        <p role="alert" className="text-destructive">
          No se pudo consultar la conexión con Stripe.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </IntegrationCard>
  )
}
