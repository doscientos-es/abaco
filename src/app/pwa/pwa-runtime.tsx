import { useEffect, useSyncExternalStore } from 'react'

import { getSaveStatus } from '@/shared/store/store'

function subscribeConnection(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

export function warnBeforeLeavingWithPendingSaves(target: Window) {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (getSaveStatus().state === 'saved') return
    event.preventDefault()
    event.returnValue = ''
  }
  target.addEventListener('beforeunload', onBeforeUnload)
  return () => target.removeEventListener('beforeunload', onBeforeUnload)
}

export function PwaRuntime() {
  const offline = useSyncExternalStore(
    subscribeConnection,
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
    () => false,
  )

  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {})
    }
    return warnBeforeLeavingWithPendingSaves(window)
  }, [])

  if (!offline) return null
  return (
    <output className="bg-foreground text-background fixed inset-x-3 top-3 z-50 mx-auto block max-w-lg rounded-lg px-4 py-3 text-sm shadow-lg">
      <strong>Sin conexión.</strong> Puedes consultar lo que ya has cargado. Algunas acciones
      necesitan internet; no cierres la aplicación si tienes cambios sin guardar.
    </output>
  )
}
