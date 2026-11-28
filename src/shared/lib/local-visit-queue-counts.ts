/** Read matching keys only; the visit API still verifies assignment before anything is shown. */
export function localVisitQueueCounts(prefix: string, read: (key: string) => readonly unknown[]) {
  const counts = new Map<string, number>()
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(prefix)) continue
    const visitId = key.slice(prefix.length)
    if (!visitId) continue
    const count = read(key).length
    if (count > 0) counts.set(visitId, count)
  }
  return counts
}
