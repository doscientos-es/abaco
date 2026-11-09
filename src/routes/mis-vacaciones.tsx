import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { MyVacationRequestsPage } from '@/features/vacations'

export const Route = createFileRoute('/mis-vacaciones')({
  beforeLoad: requirePermission('vacations:request'),
  component: MyVacationRequestsPage,
})
