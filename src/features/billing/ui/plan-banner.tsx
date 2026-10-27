import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { useSession } from '@/features/auth'

import { subscriptionQuery } from '../application/billing-actions'

/** Shows trial days left, read-only mode or a failed payment. Hidden when all is well. */
export function PlanBanner() {
  const session = useSession()
  const tenantId = session?.tenantId ?? null
  const { data: sub } = useQuery({
    ...subscriptionQuery(tenantId ?? ''),
    enabled: tenantId !== null,
  })
  if (!sub || !session) return null

  const isOwner = session.role === 'owner'
  let text = ''
  let urgent = false
  if (!sub.canWrite) {
    urgent = true
    text = 'Tu prueba ha terminado: puedes ver tus datos, pero no editarlos.'
  } else if (sub.status === 'past_due') {
    urgent = true
    text = 'No hemos podido cobrar tu última cuota.'
  } else if (sub.status === 'trialing' && sub.trialDaysLeft <= 5) {
    text = `Te ${sub.trialDaysLeft === 1 ? 'queda 1 día' : `quedan ${sub.trialDaysLeft} días`} de prueba gratuita.`
  }
  if (!text) return null

  return (
    <output
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm ${urgent ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground'}`}
    >
      <span>{text}</span>
      {isOwner ? (
        <Link to="/ajustes" className="font-medium underline">
          Ver planes
        </Link>
      ) : (
        <span className="text-xs">Pide al propietario que elija un plan.</span>
      )}
    </output>
  )
}
