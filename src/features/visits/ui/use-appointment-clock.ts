import { useEffect, useState } from 'react'

/** View-only expiry hint; database time and revision remain authoritative. */
export function useAppointmentClock(active = true) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}
