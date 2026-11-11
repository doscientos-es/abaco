import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { ClientFormPage } from '@/features/clients/ui/client-form-page'

export const Route = createFileRoute('/clientes/nuevo')({
  beforeLoad: requirePermission('clients:write'),
  component: ClientFormPage,
})
