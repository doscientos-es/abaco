import { useEffect, useState } from 'react'

/** Local wall time, refreshed at minute boundaries and when returning to the page. */
export function useCalendarNow() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    function refresh() {
      clearTimeout(timeout)
      const current = new Date()
      setNow(current)
      timeout = setTimeout(
        refresh,
        60_000 - current.getSeconds() * 1000 - current.getMilliseconds(),
      )
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refresh()
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return now
}
