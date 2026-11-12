import { Button, buttonVariants } from '@doscientos/ui'
import { Link } from '@tanstack/react-router'

import { retryStoreSaves, useSaveStatus } from '@/shared/store/store'

/** The store tracks queued writes; individual fields may commit when they lose focus. */
export function EstimateAutoSaveStatus() {
  const status = useSaveStatus()
  const trialEnded = status.message?.includes('Tu prueba ha terminado') ?? false

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 text-sm">
      <div aria-live="polite" aria-atomic="true" className="text-muted-foreground">
        <p>Los cambios válidos se guardan automáticamente al editar o salir del campo.</p>
        <p className={status.state === 'error' ? 'text-destructive font-medium' : 'text-xs'}>
          {status.state === 'saving'
            ? 'Guardando cambios…'
            : status.state === 'error'
              ? trialEnded
                ? 'Hay cambios sin guardar. Tu prueba ha terminado.'
                : 'Hay cambios sin guardar. Reintenta el guardado.'
              : 'Sincronización al día.'}
        </p>
      </div>
      {status.state === 'error' ? (
        trialEnded ? (
          <Link to="/ajustes" search={{ tab: 'plan' }} className={buttonVariants({ size: 'sm' })}>
            Elegir plan
          </Link>
        ) : (
          <Button type="button" variant="outline" size="sm" onPress={retryStoreSaves}>
            Reintentar guardado
          </Button>
        )
      ) : null}
    </div>
  )
}
