import { createFileRoute, redirect } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'

export const Route = createFileRoute('/vacaciones')({
  beforeLoad: requirePermission('vacations:manage'),
  loader: () => {
    throw redirect({ to: '/trabajadores', search: { vista: 'vacaciones' }, replace: true })
  },
})
