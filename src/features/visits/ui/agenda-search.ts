export const agendaViews = ['list', 'calendar'] as const
export const agendaPeriods = ['day', 'week'] as const

export type AgendaView = (typeof agendaViews)[number]
export type AgendaPeriod = (typeof agendaPeriods)[number]

export function validateAgendaSearch(search: Record<string, unknown>): {
  view?: AgendaView
  date?: string
  period?: AgendaPeriod
} {
  const view = agendaViews.find((candidate) => candidate === search.view)
  const period = agendaPeriods.find((candidate) => candidate === search.period)
  const date = typeof search.date === 'string' && isDateOnly(search.date) ? search.date : undefined

  return { ...(view ? { view } : {}), ...(date ? { date } : {}), ...(period ? { period } : {}) }
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
