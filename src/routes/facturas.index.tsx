import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { InvoicesPage } from '@/features/invoices'

export const Route = createFileRoute('/facturas/')({
  // `q` pre-fills the search box, so a link can point straight at one invoice.
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === 'string' && search.q !== '' ? { q: search.q } : {},
  beforeLoad: requirePermission('invoices:read'),
  component: InvoicesPage,
})
