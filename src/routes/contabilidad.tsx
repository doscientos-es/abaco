import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { LedgerPage } from '@/features/ledger'
import { validateLedgerSearch } from '@/features/ledger/ui/ledger-tabs'

export const Route = createFileRoute('/contabilidad')({
  beforeLoad: requirePermission('ledger:read'),
  validateSearch: validateLedgerSearch,
  component: LedgerPage,
})
