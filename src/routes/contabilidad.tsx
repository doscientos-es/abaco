import { createFileRoute } from '@tanstack/react-router'

import { LedgerPage } from '@/features/ledger'

export const Route = createFileRoute('/contabilidad')({ component: LedgerPage })
