import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { MyDayPage, parseCalendarVisitLink } from '@/features/visits'

export const Route = createFileRoute('/mi-jornada')({
  beforeLoad: requirePermission('visits:assigned'),
  validateSearch: (search: Record<string, unknown>) => parseCalendarVisitLink(search) ?? {},
  component: MyDayRoute,
})

function MyDayRoute() {
  const calendarVisit = parseCalendarVisitLink(Route.useSearch())
  return <MyDayPage key={JSON.stringify(calendarVisit)} calendarVisit={calendarVisit} />
}
