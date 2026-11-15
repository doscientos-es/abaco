export type AssignmentCandidate = {
  userId: string
  functionIds: string[]
  slots: Array<{ weekday: number; start: number; end: number }>
  absences: Array<{ startDate: string; endDate: string | null }>
  busy: Array<{ start: number; end: number }>
}

export type AssignmentOccurrence = {
  date: string
  endDate?: string
  weekday: number
  startMinute: number
  endMinute: number
  startTimestamp: number
  endTimestamp: number
}

/** The whole interval must fit one working shift. Unknown schedules are not availability. */
export function assignmentConflicts(
  candidate: AssignmentCandidate,
  occurrence: AssignmentOccurrence,
) {
  const result: Array<'absence' | 'schedule' | 'busy'> = []
  const lastDate =
    occurrence.endDate ??
    (occurrence.endMinute > 1440
      ? new Date(Date.parse(`${occurrence.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
      : occurrence.date)
  if (
    candidate.absences.some(
      (a) => a.startDate <= lastDate && (a.endDate === null || a.endDate >= occurrence.date),
    )
  )
    result.push('absence')
  if (
    !candidate.slots.some(
      (slot) =>
        slot.weekday === occurrence.weekday &&
        slot.start <= occurrence.startMinute &&
        (occurrence.endMinute <= 1440
          ? slot.end >= occurrence.endMinute
          : slot.end === 1440 &&
            candidate.slots.some(
              (next) =>
                next.weekday === (occurrence.weekday % 7) + 1 &&
                next.start === 0 &&
                next.end >= occurrence.endMinute - 1440,
            )),
    )
  )
    result.push('schedule')
  if (
    candidate.busy.some(
      (item) => item.start < occurrence.endTimestamp && occurrence.startTimestamp < item.end,
    )
  )
    result.push('busy')
  return result
}

/** Find distinct people for each required role, including when roles have overlapping candidates. */
export function matchAvailableWorkers(
  candidates: AssignmentCandidate[],
  occurrence: AssignmentOccurrence,
  requiredFunctions: string[],
  random: () => number = Math.random,
): string[] | null {
  const available = candidates.filter(
    (candidate) => assignmentConflicts(candidate, occurrence).length === 0,
  )
  const shuffled = [...available]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const current = shuffled[i]
    const other = shuffled[j]
    if (current && other) [shuffled[i], shuffled[j]] = [other, current]
  }
  const owners = new Map<string, number>()
  function assign(roleIndex: number, seen: Set<string>): boolean {
    const requiredFunction = requiredFunctions[roleIndex]
    if (requiredFunction === undefined) return false
    for (const candidate of shuffled) {
      if (!candidate.functionIds.includes(requiredFunction) || seen.has(candidate.userId)) continue
      seen.add(candidate.userId)
      const previous = owners.get(candidate.userId)
      if (previous === undefined || assign(previous, seen)) {
        owners.set(candidate.userId, roleIndex)
        return true
      }
    }
    return false
  }
  for (let index = 0; index < requiredFunctions.length; index++) {
    if (!assign(index, new Set())) return null
  }
  const result = Array<string>(requiredFunctions.length)
  for (const [userId, roleIndex] of owners) result[roleIndex] = userId
  return result
}
