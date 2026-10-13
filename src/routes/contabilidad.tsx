import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { LedgerPage } from '@/features/ledger'

export const Route = createFileRoute('/contabilidad')({
  beforeLoad: requirePermission('ledger:read'),
  component: LedgerPage,
})
