import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { WorkOrderDetailPage } from '@/features/work-orders'

export const Route = createFileRoute('/trabajos/$workOrderId')({
  beforeLoad: requirePermission('work:read'),
  component: WorkOrderRoute,
})

function WorkOrderRoute() {
  const { workOrderId } = Route.useParams()
  return <WorkOrderDetailPage workOrderId={workOrderId} />
}
