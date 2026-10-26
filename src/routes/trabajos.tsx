import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { WorkOrdersPage } from '@/features/work-orders'

export const Route = createFileRoute('/trabajos')({
  beforeLoad: requirePermission('work:read'),
  component: WorkOrdersPage,
})
