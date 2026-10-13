import { createFileRoute } from '@tanstack/react-router'

import { InvoicesPage } from '@/features/invoices'

export const Route = createFileRoute('/facturas')({ component: InvoicesPage })
