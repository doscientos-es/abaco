import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { InvoicesPage } from '@/features/invoices'
import { formLimits } from '@/shared/domain/form-limits'

export const Route = createFileRoute('/facturas/')({
  // `q` pre-fills the search box, so a link can point straight at one invoice.
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === 'string' && search.q !== ''
      ? { q: search.q.slice(0, formLimits.searchQuery) }
      : {},
  beforeLoad: requirePermission('invoices:read'),
  component: InvoicesPage,
})
