import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { VacationManagementPage } from '@/features/vacations'

export const Route = createFileRoute('/vacaciones')({
  beforeLoad: requirePermission('vacations:manage'),
  component: VacationManagementPage,
})
