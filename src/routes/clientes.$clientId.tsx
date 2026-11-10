import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { ClientPassportPage } from '@/features/clients/ui/client-passport-page'

export const Route = createFileRoute('/clientes/$clientId')({
  beforeLoad: requirePermission('clients:read'),
  component: ClientRoute,
})

function ClientRoute() {
  const { clientId } = Route.useParams()
  return <ClientPassportPage clientId={clientId} />
}
