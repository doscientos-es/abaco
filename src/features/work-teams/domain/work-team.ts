import { z } from 'zod'

/** Operational groups do not grant permissions or consume additional subscription seats. */
export type WorkTeam = {
  id: string
  name: string
  description: string
  memberIds: string[]
  archived: boolean
  updatedAt: string
}

export const workTeamInput = z
  .object({
    tenantId: z.string().uuid(),
    id: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
    name: z.string().trim().min(1, 'Indica un nombre para el equipo.').max(80),
    description: z.string().trim().max(1000),
    memberIds: z
      .array(z.string().uuid())
      .max(100)
      .transform((ids) => [...new Set(ids)].sort()),
    archived: z.boolean(),
    operationId: z.string().uuid(),
  })
  .refine((input) => input.archived || input.memberIds.length > 0, {
    message: 'Selecciona al menos una persona para el equipo.',
    path: ['memberIds'],
  })

export type SaveWorkTeam = z.infer<typeof workTeamInput>

export type WorkTeamRepository = {
  list(tenantId: string): Promise<WorkTeam[]>
  save(input: SaveWorkTeam): Promise<void>
}

/** Keep the current archived/empty team visible, but never offer it for a new assignment. */
export function assignableWorkTeams(teams: WorkTeam[], currentId: string | null) {
  return teams.filter(
    (team) => team.id === currentId || (!team.archived && team.memberIds.length > 0),
  )
}

export function workTeamLabel(team: WorkTeam) {
  const status = team.archived
    ? ' · Archivado'
    : team.memberIds.length === 0
      ? ' · Sin personas'
      : ''
  return `${team.name}${status}`
}
