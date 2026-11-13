import { createFileRoute, redirect } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { StaffSchedulesPage } from '@/features/staff-schedules'

export const Route = createFileRoute('/horarios')({
  beforeLoad: requirePermission('settings:personal'),
  loader: ({ context }) => {
    if (context.session?.role === 'admin') {
      throw redirect({ to: '/trabajadores', search: { vista: 'horarios' }, replace: true })
    }
  },
  component: StaffSchedulesPage,
})
