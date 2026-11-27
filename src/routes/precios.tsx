import { createFileRoute } from '@tanstack/react-router'

import { PublicPricing } from '@/features/billing'

export const Route = createFileRoute('/precios')({ component: PricingPage })

function PricingPage() {
  const { session } = Route.useRouteContext()
  return (
    <PublicPricing viewer={!session ? 'guest' : session.role === 'admin' ? 'admin' : 'worker'} />
  )
}
