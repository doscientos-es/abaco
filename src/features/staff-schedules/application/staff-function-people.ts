import type { StaffPerson } from '../domain/staff-schedule'
import { saveStaffSchedule } from './staff-schedule-actions'

/** Save only changed people, preserving their other functions and versioned schedules. */
export async function saveFunctionPeople(
  tenantId: string,
  functionId: string,
  people: StaffPerson[],
  selected: string[],
): Promise<StaffPerson[]> {
  const chosen = new Set(selected)
  const changed = people.filter(
    (person) =>
      chosen.has(person.userId) !== (person.schedule?.functionIds.includes(functionId) ?? false),
  )
  const failed: StaffPerson[] = []
  // Limit concurrent requests while allowing large teams to be processed promptly.
  for (let start = 0; start < changed.length; start += 5) {
    const batch = changed.slice(start, start + 5)
    const results = await Promise.allSettled(
      batch.map((person) => {
        const schedule = person.schedule
        const otherFunctions = (schedule?.functionIds ?? []).filter((id) => id !== functionId)
        return saveStaffSchedule(
          tenantId,
          person.userId,
          schedule?.updatedAt ?? null,
          schedule?.slots ?? [],
          chosen.has(person.userId) ? [...otherFunctions, functionId] : otherFunctions,
        )
      }),
    )
    results.forEach((result, index) => {
      const person = batch[index]
      if (result.status === 'rejected' && person) failed.push(person)
    })
  }
  return failed
}
