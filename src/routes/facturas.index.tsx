import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { InvoicesPage } from '@/features/invoices'
import { validateInvoicesSearch } from '@/features/invoices/ui/invoices-tabs'

export const Route = createFileRoute('/facturas/')({
  validateSearch: validateInvoicesSearch,
  beforeLoad: requirePermission('invoices:read'),
  component: InvoicesPage,
})
