import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { InvoiceDetailPage } from '@/features/invoices'

export const Route = createFileRoute('/facturas/$invoiceId')({
  beforeLoad: requirePermission('invoices:read'),
  component: DetailRoute,
})

function DetailRoute() {
  const { invoiceId } = Route.useParams()
  return <InvoiceDetailPage invoiceId={invoiceId} />
}
