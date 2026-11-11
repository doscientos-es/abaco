import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { ClientFormPage } from '@/features/clients/ui/client-form-page'

export const Route = createFileRoute('/clientes/$clientId_/editar')({
  beforeLoad: requirePermission('clients:write'),
  component: EditClientRoute,
})

function EditClientRoute() {
  const { clientId } = Route.useParams()
  return <ClientFormPage key={clientId} clientId={clientId} />
}
