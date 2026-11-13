import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { EstimateCreatePage } from '@/features/estimates/ui/estimate-create-page'

export const Route = createFileRoute('/presupuestos/nuevo')({
  beforeLoad: requirePermission('estimates:write'),
  validateSearch: (search: Record<string, unknown>) => ({
    clientId: typeof search.clientId === 'string' ? search.clientId : '',
    title: typeof search.title === 'string' ? search.title : '',
    format: 'sections' as const,
  }),
  component: CreateRoute,
})

function CreateRoute() {
  const search = Route.useSearch()
  return <EstimateCreatePage {...search} />
}
