import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { InvoicesPage } from '@/features/invoices'

export const Route = createFileRoute('/facturas')({
  beforeLoad: requirePermission('invoices:read'),
  component: InvoicesPage,
})
