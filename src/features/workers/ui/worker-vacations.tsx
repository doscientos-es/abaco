import { useState } from 'react'

import type { TeamMember } from '@/features/settings/application/team-actions'
import {
  defaultStaffSelection,
  selectedStaffIds,
  StaffPeopleFilterPopover,
  type StaffSelection,
} from '@/features/staff-schedules'
import { VacationManagementPage } from '@/features/vacations'
import type { WorkTeam } from '@/features/work-teams'

export function WorkerVacations({
  people,
  teams,
  memberIds,
}: {
  people: TeamMember[]
  teams: WorkTeam[]
  memberIds?: string[] | undefined
}) {
  const [selection, setSelection] = useState<StaffSelection | undefined>(undefined)
  const available = people
    .filter((person) => !memberIds || memberIds.includes(person.userId))
    .map((person) => ({
      userId: person.userId,
      name: person.fullName || person.email,
      email: person.email,
      schedule: null,
    }))
  const ids = new Set(available.map((person) => person.userId))
  const groups = teams
    .filter((team) => !team.archived)
    .map((team) => ({ ...team, memberIds: team.memberIds.filter((id) => ids.has(id)) }))
    .filter((team) => team.memberIds.length)
  const selected = selection ?? defaultStaffSelection(available, memberIds !== undefined)
  const visible = [...selectedStaffIds(available, groups, selected)]
  const filter = (
    <StaffPeopleFilterPopover
      people={available}
      teams={groups}
      selected={selected}
      onChange={setSelection}
    />
  )
  return (
    <div className="space-y-5">
      {visible.length ? (
        <VacationManagementPage memberIds={visible} embedded headerFilter={filter} />
      ) : (
        <>
          {filter}
          <p className="text-muted-foreground text-sm">
            Selecciona personas o equipos para consultar sus vacaciones y ausencias.
          </p>
        </>
      )}
    </div>
  )
}
