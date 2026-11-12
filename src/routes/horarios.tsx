import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { StaffSchedulesPage } from '@/features/staff-schedules'

export const Route = createFileRoute('/horarios')({
  beforeLoad: requirePermission('settings:personal'),
  component: StaffSchedulesPage,
})
