import { Button, buttonVariants } from '@doscientos/ui'
import { Info } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'

import type { SaveStatus } from '@/shared/store/store'

export function SaveStatusNotice({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status.state === 'saved') return null
  if (status.state === 'saving') {
    return (
      <output className="text-muted-foreground block px-4 pt-2 text-xs sm:px-10">
        Guardando cambios…
      </output>
    )
  }

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
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/ajustes" search={{ tab: 'plan' }} className={buttonVariants({ size: 'sm' })}>
            Elegir plan
          </Link>
          <Button type="button" size="sm" variant="ghost" onClick={onRetry}>
            Reintentar guardado
          </Button>
        </div>
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
