import { createFileRoute } from '@tanstack/react-router'

import { parsePlatformSearch, SuperadminPage } from '@/features/superadmin'

export const Route = createFileRoute('/superadmin')({
  validateSearch: parsePlatformSearch,
  component: PlatformRoute,
})

function PlatformRoute() {
  return <SuperadminPage search={Route.useSearch()} />
}
