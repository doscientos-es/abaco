import { z } from 'zod'

export const planningViews = ['list', 'calendar'] as const
export const planningPeriods = ['day', 'week', 'month'] as const
const statuses = ['scheduled', 'in_progress', 'completed', 'skipped', 'canceled'] as const
const assignee = z.union([z.literal('unassigned'), z.string().uuid()])

export type PlanningView = (typeof planningViews)[number]
export type PlanningPeriod = (typeof planningPeriods)[number]
export type WorkPlanningSearch = {
  view?: PlanningView | undefined
  date?: string | undefined
  period?: PlanningPeriod | undefined
  technician?: string | undefined
  team?: string | undefined
  status?: (typeof statuses)[number] | undefined
  q?: string | undefined
}

export function validateWorkPlanningSearch(search: Record<string, unknown>): WorkPlanningSearch {
  const view = planningViews.find((candidate) => candidate === search.view)
  const period = planningPeriods.find((candidate) => candidate === search.period)
  const date = typeof search.date === 'string' && isDateOnly(search.date) ? search.date : undefined
  const technician = assignee.safeParse(search.technician)
  const team = assignee.safeParse(search.team)
  const status = statuses.find((candidate) => candidate === search.status)
  const q = typeof search.q === 'string' ? search.q.slice(0, 200) : ''
  return {
    ...(view ? { view } : {}),
    ...(date ? { date } : {}),
    ...(period ? { period } : {}),
    ...(technician.success ? { technician: technician.data } : {}),
    ...(team.success ? { team: team.data } : {}),
    ...(status ? { status } : {}),
    ...(q.trim() ? { q } : {}),
  }
}

function isDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  )
}
