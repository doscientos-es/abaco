import { useSyncExternalStore } from 'react'

export function browserOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function subscribe(change: () => void) {
  window.addEventListener('online', change)
  window.addEventListener('offline', change)
  return () => {
    window.removeEventListener('online', change)
    window.removeEventListener('offline', change)
  }
}

export function useBrowserOnline() {
  return useSyncExternalStore(subscribe, browserOnline, () => true)
}
