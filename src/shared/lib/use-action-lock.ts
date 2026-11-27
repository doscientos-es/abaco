import { useMemo, useRef } from 'react'

/** Synchronous guard against duplicate actions before React commits the pending state. */
export function useActionLock() {
  const locked = useRef(false)
  return useMemo(
    () => ({
      acquire() {
        if (locked.current) return false
        locked.current = true
        return true
      },
      release() {
        locked.current = false
      },
    }),
    [],
  )
}
