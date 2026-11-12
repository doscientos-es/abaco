import { createFileRoute, Outlet } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'

export const Route = createFileRoute('/contratos')({
  beforeLoad: requirePermission('contracts:read'),
  component: Outlet,
})
