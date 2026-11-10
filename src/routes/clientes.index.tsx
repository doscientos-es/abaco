import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { ClientsPage } from '@/features/clients'

export const Route = createFileRoute('/clientes/')({
  beforeLoad: requirePermission('clients:read'),
  component: ClientsPage,
})
