import { Button, buttonVariants } from '@doscientos/ui'
import { CloudArrowUp, CloudCheck, Info, WarningCircle } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'

import type { SaveStatus } from '@/shared/store/store'

export function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  const Icon =
    status.state === 'saving' ? CloudArrowUp : status.state === 'error' ? WarningCircle : CloudCheck
  const label =
    status.state === 'saving' ? 'Guardando…' : status.state === 'error' ? 'Sin guardar' : 'Guardado'

  return (
    <output
      aria-live="polite"
      aria-atomic="true"
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${status.state === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted/70 text-muted-foreground'}`}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="max-[360px]:sr-only">{label}</span>
    </output>
  )
}

export function SaveStatusNotice({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status.state !== 'error') return null

  const trialEnded = status.message?.includes('Tu prueba ha terminado') ?? false
  if (trialEnded) {
    return (
      <section
        aria-live="polite"
        aria-atomic="true"
        className="border-primary/20 bg-accent text-accent-foreground mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm sm:mx-10"
      >
        <Info aria-hidden="true" className="text-primary size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">La prueba gratuita ha terminado</p>
          <p className="text-muted-foreground mt-0.5">
            Tus datos guardados siguen a salvo. Este último cambio no se ha guardado; elige un plan
            para seguir editando.
          </p>
        </div>
        <Link to="/ajustes" search={{ tab: 'plan' }} className={buttonVariants({ size: 'sm' })}>
          Elegir plan
        </Link>
      </section>
    )
  }

  return (
    <div
      role="alert"
      className="border-destructive bg-background mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm sm:mx-10"
    >
      <span className="flex-1">Hay cambios sin guardar. {status.message}</span>
      <Button type="button" variant="outline" onClick={onRetry}>
        Reintentar guardado
      </Button>
    </div>
  )
}
