import { Button } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthLayout, completeWelcome, FormError, sessionQuery, useSession } from '@/features/auth'
import { subscriptionQuery } from '@/features/billing'

export function WelcomePage() {
  const session = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const subscriptionState = useQuery({
    ...subscriptionQuery(session?.tenantId ?? ''),
    enabled: Boolean(session?.tenantId),
  })
  const subscription = subscriptionState.data
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasAccess =
    subscription?.isComplimentary ||
    subscription?.status === 'active' ||
    subscription?.status === 'past_due'

  async function continueToCompany() {
    if (busy || !subscription) return
    setBusy(true)
    setError(null)
    try {
      const result = await completeWelcome()
      if (!result.ok) {
        setError(result.message)
        return
      }
      // Refresh before navigating so the root guard no longer sends us back to welcome.
      await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 })
      await navigate(
        hasAccess
          ? { to: '/', replace: true }
          : { to: '/ajustes', search: { tab: 'plan' }, replace: true },
      )
    } catch {
      setError('No se pudo continuar. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Bienvenido a Ábaco"
      description="Tu empresa está creada. Activa tu suscripción para empezar a trabajar."
    >
      <section aria-label="Tu primer presupuesto" className="space-y-2 text-sm">
        <h2 className="font-semibold">Tu primer presupuesto, paso a paso</h2>
        <ol className="text-muted-foreground list-decimal space-y-1 pl-4">
          <li>Añade un cliente.</li>
          <li>Prepara las partidas de materiales y mano de obra.</li>
          <li>Envía el enlace por WhatsApp o correo y consulta la respuesta.</li>
        </ol>
      </section>
      <section
        aria-label="Tu acceso"
        className="border-primary/30 bg-primary/5 space-y-3 rounded-xl border p-4"
      >
        <div className="space-y-1">
          <h2 className="font-semibold">
            {hasAccess ? 'Tu acceso está activo' : 'Activa tu suscripción'}
          </h2>
          <p className="text-muted-foreground text-sm">
            {hasAccess
              ? 'Ya puedes acceder a tu empresa.'
              : 'Elige un plan y paga con tarjeta para utilizar Ábaco.'}
          </p>
        </div>
        <Button
          className="w-full"
          isDisabled={busy || !subscription}
          onPress={() => void continueToCompany()}
        >
          {busy ? 'Continuando…' : hasAccess ? 'Ir a mi empresa' : 'Elegir un plan'}
        </Button>
      </section>
      {subscriptionState.isError ? (
        <p role="alert">No se pudo comprobar tu suscripción. Vuelve a intentarlo.</p>
      ) : null}
      <FormError message={error} />
    </AuthLayout>
  )
}
