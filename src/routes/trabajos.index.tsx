import { createFileRoute } from '@tanstack/react-router'

import { WorkOrdersPage } from '@/features/work-orders'

export const Route = createFileRoute('/trabajos/')({
  component: WorkOrdersPage,
})
