import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { WorkersPage, validateWorkersSearch } from '@/features/workers'

export const Route = createFileRoute('/trabajadores')({
  beforeLoad: requirePermission('team:manage'),
  validateSearch: validateWorkersSearch,
  component: WorkersPage,
})
