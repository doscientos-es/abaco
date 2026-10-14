import { createFileRoute } from '@tanstack/react-router'

import { PublicEstimatePage } from '@/features/estimates'

export const Route = createFileRoute('/p/$token')({ component: PublicRoute })

function PublicRoute() {
  const { token } = Route.useParams()
  return <PublicEstimatePage token={token} />
}
