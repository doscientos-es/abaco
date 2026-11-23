import { Button, buttonVariants } from '@doscientos/ui'
import { CloudArrowUp, CloudCheck, Info, WarningCircle } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import type { SaveStatus } from '@/shared/store/store'

export function SaveStatusIndicator({
  status,
  compact = false,
}: {
  status: SaveStatus | null
  compact?: boolean
}) {
  const state = status?.state
  const Icon = state === 'saving' ? CloudArrowUp : state === 'error' ? WarningCircle : CloudCheck
  const label = state === 'saving' ? 'Guardando…' : state === 'error' ? 'Sin guardar' : 'Guardado'
  const tone =
    state === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted/70 text-muted-foreground'

  return (
    <output
      aria-live="polite"
      aria-atomic="true"
      className={
        state
          ? `inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${tone}`
          : 'sr-only'
      }
    >
      {state ? (
        <>
          <Icon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className={compact && state !== 'saving' ? 'sr-only' : 'max-[360px]:sr-only'}>
            {label}
          </span>
        </>
      ) : null}
    </output>
  )
}

export function MobileSaveStatus({ status }: { status: SaveStatus }) {
  const [dismissed, setDismissed] = useState(status)
  const showConfirmation = status.state === 'saved' && status.confirmed && status !== dismissed

  useEffect(() => {
    if (!showConfirmation) return
    const timer = setTimeout(() => setDismissed(status), 1600)
    return () => clearTimeout(timer)
  }, [showConfirmation, status])

  return (
    <SaveStatusIndicator
      status={status.state !== 'saved' || showConfirmation ? status : null}
      compact
    />
  )
}

export function SaveStatusNotice({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status.state !== 'error') return null

  const planRequired =
    status.message?.includes('Tu prueba ha terminado') ||
    status.message?.includes('Activa tu suscripción')
  if (planRequired) {
    return (
      <section
        aria-live="polite"
        aria-atomic="true"
        className="border-primary/20 bg-accent text-accent-foreground mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm sm:mx-10"
      >
        <Info aria-hidden="true" className="text-primary size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Suscripción necesaria</p>
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
