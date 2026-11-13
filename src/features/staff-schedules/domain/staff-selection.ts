import type { StaffPerson } from './staff-schedule'

export type StaffSelection = { personIds: string[]; teamIds: string[] }
export type StaffTeam = { id: string; name: string; memberIds: string[] }

/** Small companies and explicit team/person contexts open with everyone in that context. */
export function defaultStaffSelection(
  people: { userId: string }[],
  scoped = false,
): StaffSelection {
  return {
    personIds: scoped || people.length <= 25 ? people.map((person) => person.userId) : [],
    teamIds: [],
  }
}

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
