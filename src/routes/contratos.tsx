import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { ContractsPage } from '@/features/contracts'

export const Route = createFileRoute('/contratos')({
  beforeLoad: requirePermission('contracts:read'),
  component: ContractsPage,
})
