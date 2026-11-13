import { PageHeader, PageHeaderHeading, PageHeaderTitle } from '@doscientos/ui'
import { Link, useNavigate } from '@tanstack/react-router'

import { useTenantData } from '@/shared/store/store'
import { PageNotFound } from '@/shared/ui/page-states'

import { ClientForm } from './client-form-dialog'

export function ClientFormPage({ clientId }: { clientId?: string }) {
  const { clients } = useTenantData()
  const navigate = useNavigate()
  const client = clientId ? clients.find((item) => item.id === clientId) : undefined

  if (clientId && !client) {
    return (
      <PageNotFound
        title="Cliente no encontrado"
        description="Este cliente ya no pertenece a la empresa activa."
        backTo="/clientes"
        backLabel="Volver a clientes"
      />
    )
  }

  const close = () => {
    if (clientId) void navigate({ to: '/clientes/$clientId', params: { clientId } })
    else void navigate({ to: '/clientes' })
  }

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderHeading>
          <Link to="/clientes" className="text-primary text-sm font-medium hover:underline">
            ← Clientes
          </Link>
          <PageHeaderTitle>{client ? 'Editar cliente' : 'Nuevo cliente'}</PageHeaderTitle>
        </PageHeaderHeading>
      </PageHeader>
      <ClientForm
        variant="page"
        client={client ?? null}
        onClose={close}
        onSaved={(id) => void navigate({ to: '/clientes/$clientId', params: { clientId: id } })}
      />
    </div>
  )
}
