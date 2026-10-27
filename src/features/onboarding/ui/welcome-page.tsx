import { Button } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthLayout, completeWelcome, FormError, sessionQuery, useSession } from '@/features/auth'
import { subscriptionQuery, TRIAL_DAYS } from '@/features/billing'

const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

export function WelcomePage() {
  const session = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const subscription = useQuery({
    ...subscriptionQuery(session?.tenantId ?? ''),
    enabled: Boolean(session?.tenantId),
  }).data
  const [busy, setBusy] = useState<'trial' | 'plan' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const trialing = subscription?.status === 'trialing'
  const expired = trialing && !subscription.canWrite
  const daysLeft = subscription?.trialDaysLeft ?? TRIAL_DAYS
  const trialLabel = expired
    ? 'Continuar en modo lectura'
    : subscription && !trialing
      ? 'Ir a mi empresa'
      : `Empezar ${daysLeft} días gratis`

  async function choose(choice: 'trial' | 'plan') {
    if (busy) return
    setBusy(choice)
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
        choice === 'plan'
          ? { to: '/ajustes', search: { tab: 'plan' }, replace: true }
          : { to: '/', replace: true },
      )
    } catch {
      setError('No se pudo continuar. Inténtalo de nuevo.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <AuthLayout
      title="¿Cómo quieres empezar?"
      description="Tu empresa ya está lista. Prueba Ábaco con un presupuesto real y sigue la respuesta de tu cliente."
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
        aria-label="Prueba gratuita"
        className="border-primary/30 bg-primary/5 space-y-3 rounded-xl border p-4"
      >
        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
          Sin tarjeta
        </span>
        <div className="space-y-1">
          <h2 className="font-semibold">Prueba gratuita</h2>
          <p className="text-muted-foreground text-sm">
            Todas las funciones del plan Empresa durante {TRIAL_DAYS} días.
          </p>
          {trialing ? (
            <p className="text-muted-foreground text-xs">
              {expired ? 'Tu prueba terminó el' : 'Tu prueba termina el'}{' '}
              {day.format(subscription.trialEndsAt)}.
            </p>
          ) : null}
        </div>
        <Button className="w-full" isDisabled={busy !== null} onPress={() => void choose('trial')}>
          {busy === 'trial' ? 'Entrando…' : trialLabel}
        </Button>
      </section>
      <section
        aria-label="Elegir un plan"
        className="border-border space-y-3 rounded-xl border p-4"
      >
        <div className="space-y-1">
          <h2 className="font-semibold">¿Ya lo tienes claro?</h2>
          <p className="text-muted-foreground text-sm">
            Todas las funciones están incluidas. Elige según el número de personas de tu equipo y
            paga con tarjeta.
          </p>
        </div>
        <Button
          variant="outline"
          className="w-full"
          isDisabled={busy !== null}
          onPress={() => void choose('plan')}
        >
          {busy === 'plan' ? 'Abriendo planes…' : 'Elegir un plan ahora'}
        </Button>
      </section>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Sin tarjeta ni cobros automáticos durante la prueba. Al terminar, eliges un plan. Si no
        contratas, tus datos se conservan en modo lectura.
      </p>
      <FormError message={error} />
    </AuthLayout>
  )
}
