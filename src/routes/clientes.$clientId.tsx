import { createFileRoute } from '@tanstack/react-router'

import { ClientPassportPage } from '@/features/clients/ui/client-passport-page'

export const Route = createFileRoute('/clientes/$clientId')({
  component: ClientRoute,
})

function ClientRoute() {
  const { clientId } = Route.useParams()
  return <ClientPassportPage clientId={clientId} />
}
