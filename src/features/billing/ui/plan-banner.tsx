import { Alert, AlertDescription, AlertTitle, buttonVariants } from '@doscientos/ui'
import { ArrowRight, WarningCircle } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { useSession } from '@/features/auth'

import { subscriptionQuery } from '../application/billing-actions'

/** Shows billing notices at the top, with a compact read-only notice in the desktop sidebar. */
export function PlanBanner({ placement = 'top' }: { placement?: 'top' | 'sidebar' }) {
  const session = useSession()
  const tenantId = session?.tenantId ?? null
  const { data: sub } = useQuery({
    ...subscriptionQuery(tenantId ?? ''),
    enabled: tenantId !== null,
  })
  if (!sub || !session || sub.isComplimentary) return null

  const isAdmin = session.role === 'admin'
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

  if (!sub.canWrite) {
    return placement === 'sidebar' ? (
      <div className="shrink-0 px-3 pb-3">
        <Alert variant="warning" className="rounded-xl px-3 py-3 shadow-sm">
          <WarningCircle aria-hidden="true" className="size-4" />
          <AlertTitle className="text-xs font-semibold">Prueba finalizada</AlertTitle>
          <AlertDescription className="space-y-2 text-xs">
            <span className="block">Activa un plan para volver a editar tus datos.</span>
            {isAdmin ? (
              <PlanLink label="Activar plan" fullWidth />
            ) : (
              <span className="block">Pide a un administrador que active un plan.</span>
            )}
          </AlertDescription>
        </Alert>
      </div>
    ) : (
      <Alert
        variant="warning"
        className="plan-banner-expired-top rounded-none border-x-0 border-t-0 px-4 py-3 shadow-sm sm:px-10 md:hidden"
      >
        <WarningCircle aria-hidden="true" className="size-5" />
        <AlertTitle className="text-sm font-semibold">Tu prueba ha terminado</AlertTitle>
        <AlertDescription className="mt-1">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span>Puedes ver tus datos, pero no editarlos.</span>
            {isAdmin ? (
              <PlanLink label="Activar plan" />
            ) : (
              <span className="text-xs">Pide a un administrador que elija un plan.</span>
            )}
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  if (placement === 'sidebar') return null

  return (
    <output
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm ${urgent ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground'}`}
    >
      <span>{text}</span>
      {isAdmin ? (
        <PlanLink />
      ) : (
        <span className="text-xs">Pide a un administrador que elija un plan.</span>
      )}
    </output>
  )
}

function PlanLink({
  label = 'Ver planes',
  fullWidth = false,
}: {
  label?: string
  fullWidth?: boolean
}) {
  return (
    <Link
      to="/ajustes"
      search={{ tab: 'plan' }}
      className={buttonVariants({ size: 'sm', className: fullWidth ? 'mt-2 w-full' : undefined })}
    >
      {label} <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  )
}
