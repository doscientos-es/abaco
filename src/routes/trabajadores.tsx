import { createFileRoute, redirect } from '@tanstack/react-router'

import { requirePermission, sessionQuery } from '@/features/auth'
import { staffModuleQuery } from '@/features/product-modules'
import { WorkersPage, validateWorkersSearch } from '@/features/workers'

export const Route = createFileRoute('/trabajadores')({
  beforeLoad: async ({ context }) => {
    await requirePermission('team:manage')({ context })
    const session = await context.queryClient.ensureQueryData(sessionQuery)
    if (
      !session?.tenantId ||
      !(await context.queryClient.fetchQuery(staffModuleQuery(session.tenantId)))
    ) {
      throw redirect({ to: '/ajustes', search: { tab: 'plan' }, replace: true })
    }
  },
  validateSearch: validateWorkersSearch,
  component: WorkersPage,
})
