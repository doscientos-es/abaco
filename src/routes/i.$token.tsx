import { createFileRoute } from '@tanstack/react-router'

import { PublicVisitReportPage } from '@/features/visits/ui/public-visit-report-page'

export const Route = createFileRoute('/i/$token')({ component: PublicRoute })

function PublicRoute() {
  const { token } = Route.useParams()
  return <PublicVisitReportPage token={token} />
}
