import type { StaffPerson } from './staff-schedule'

export type StaffSelection = { personIds: string[]; teamIds: string[] }
export type StaffTeam = { id: string; name: string; memberIds: string[] }

/** Resolve groups against current company members, deduplicating overlapping selections. */
export function selectedStaffIds(
  people: StaffPerson[],
  teams: StaffTeam[],
  selection: StaffSelection,
): Set<string> {
  const ids = new Set(selection.personIds)
  const teamIds = new Set(selection.teamIds)
  for (const team of teams) {
    if (teamIds.has(team.id)) {
      for (const id of team.memberIds) ids.add(id)
    }
  }
  return new Set(people.filter((person) => ids.has(person.userId)).map((person) => person.userId))
}
