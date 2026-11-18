import { createFileRoute, redirect } from '@tanstack/react-router'

import { requirePermission, sessionQuery } from '@/features/auth'
import { SuppliersPage } from '@/features/catalog'
import { tenantModulesQuery } from '@/features/product-modules'

export const Route = createFileRoute('/proveedores')({
  beforeLoad: async ({ context }) => {
    await requirePermission('catalog:read')({ context })
    const session = await context.queryClient.ensureQueryData(sessionQuery)
    if (!session?.tenantId) throw redirect({ to: '/catalogo', replace: true })
    const enabled = await context.queryClient.fetchQuery(tenantModulesQuery(session.tenantId))
    if (!enabled.includes('procurement')) throw redirect({ to: '/catalogo', replace: true })
  },
  component: SuppliersPage,
})
