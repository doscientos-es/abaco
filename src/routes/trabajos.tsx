import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { parseWorkSearch, WorkOrdersPage } from '@/features/work-orders'

export const Route = createFileRoute('/trabajos')({
  beforeLoad: requirePermission('work:read'),
  validateSearch: parseWorkSearch,
  component: WorkOrdersPage,
})
