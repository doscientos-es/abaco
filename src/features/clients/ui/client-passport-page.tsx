import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  IconButton,
  PageHeader,
  PageHeaderActions,
  PageHeaderHeading,
  PageHeaderTitle,
} from '@doscientos/ui'
import { PencilSimple } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { can, useSession } from '@/features/auth'
import { IncidentPanel } from '@/features/incidents/ui/incident-panel'
import { ClientVisitHistory } from '@/features/visits/ui/client-visit-history'
import { useTenantData } from '@/shared/store/store'
import { PageNotFound } from '@/shared/ui/page-states'

import { loadClientPassport } from '../application/client-passport-actions'
import { CreatePassportItem, contactRoles, type NewItem } from './client-passport-dialog'

export function ClientPassportPage({ clientId }: { clientId: string }) {
  const { tenant, clients } = useTenantData()
  const session = useSession()
  const client = clients.find((item) => item.id === clientId)
  const queryClient = useQueryClient()
  const queryKey = ['client-passport', tenant.id, clientId]
  const passport = useQuery({
    queryKey,
    queryFn: () => loadClientPassport(tenant.id, clientId),
    enabled: Boolean(client),
  })
  const [creating, setCreating] = useState<NewItem | null>(null)
  const canWrite = can(session?.role, 'clients:write')

  if (!client) {
    return (
      <PageNotFound
        title="Cliente no encontrado"
        description="Este cliente ya no pertenece a la empresa activa."
        backTo="/clientes"
        backLabel="Volver a clientes"
      />
    )
  }

  const data = passport.data
  return (
    <div className="space-y-8">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>{client.name}</PageHeaderTitle>
        </PageHeaderHeading>
        <PageHeaderActions>
          {canWrite ? (
            <>
              <Link
                to="/clientes/$clientId/editar"
                params={{ clientId }}
                className="text-primary text-sm font-medium hover:underline"
              >
                Editar cliente
              </Link>
              <Button onPress={() => setCreating({ kind: 'location' })}>Añadir centro</Button>
            </>
          ) : null}
          <Link to="/clientes" className="text-primary text-sm font-medium hover:underline">
            Volver a clientes
          </Link>
        </PageHeaderActions>
      </PageHeader>

      {passport.isPending ? <output>Cargando ficha del cliente…</output> : null}
      {passport.isError ? (
        <div role="alert" className="border-destructive rounded-lg border p-4 text-sm">
          No se pudo cargar la ficha: {passport.error.message}
          <Button variant="outline" className="ml-3" onPress={() => void passport.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {data ? (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Contactos</CardTitle>
              {canWrite ? (
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => setCreating({ kind: 'contact' })}
                >
                  Añadir contacto
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {data.contacts.length ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {data.contacts
                    .filter((contact) => contact.active)
                    .map((contact) => (
                      <li key={contact.id} className="border-border rounded-lg border p-3 text-sm">
                        <p className="font-medium">{contact.name}</p>
                        <p className="text-muted-foreground">
                          {contactRoles.find((role) => role.value === contact.role)?.label}
                        </p>
                        {contact.phone ? (
                          <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                        ) : null}
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`} className="block break-all">
                            {contact.email}
                          </a>
                        ) : null}
                        {canWrite ? (
                          <IconButton
                            label={`Editar contacto ${contact.name}`}
                            variant="ghost"
                            onPress={() => setCreating({ kind: 'editContact', contact })}
                          >
                            <PencilSimple aria-hidden="true" className="size-4" />
                          </IconButton>
                        ) : null}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">Aún no hay contactos adicionales.</p>
              )}
            </CardContent>
          </Card>

          <section className="space-y-4" aria-labelledby="locations-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="locations-title" className="text-xl font-semibold">
                Centros de trabajo
              </h2>
            </div>
            {data.locations.filter((location) => location.active).length === 0 ? (
              <p className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
                Añade la primera ubicación de servicio o facturación de este cliente.
              </p>
            ) : null}
            {data.locations.map((location) => (
              <Card key={location.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {location.name}
                      {!location.active ? ' · Inactivo' : ''}
                    </CardTitle>
                    <p className="text-muted-foreground text-sm">
                      {location.address}
                      {location.city ? ` · ${location.city}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canWrite ? (
                      <IconButton
                        label={`Editar centro ${location.name}`}
                        variant="ghost"
                        onPress={() => setCreating({ kind: 'editLocation', location })}
                      >
                        <PencilSimple aria-hidden="true" className="size-4" />
                      </IconButton>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm whitespace-pre-wrap">{location.operational_contact}</p>
                  <p className="text-sm whitespace-pre-wrap">{location.access_notes}</p>
                  <p className="text-sm whitespace-pre-wrap">{location.notes}</p>
                </CardContent>
              </Card>
            ))}
          </section>
          <ClientVisitHistory
            key={`${tenant.id}:${clientId}`}
            tenantId={tenant.id}
            clientId={clientId}
            clientName={client.name}
            locations={data.locations}
          />
          {canWrite && session?.userId ? (
            <Card>
              <CardContent>
                <IncidentPanel
                  tenantId={tenant.id}
                  clientId={clientId}
                  userId={session.userId}
                  passport={data}
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      {creating ? (
        <CreatePassportItem
          key={dialogKey(creating)}
          item={creating}
          tenantId={tenant.id}
          clientId={clientId}
          onClose={() => setCreating(null)}
          onCreated={() => {
            setCreating(null)
            void queryClient.invalidateQueries({ queryKey })
            void queryClient.invalidateQueries({
              queryKey: ['work-target-options', tenant.id, clientId],
            })
          }}
          onError={() => void queryClient.invalidateQueries({ queryKey })}
        />
      ) : null}
    </div>
  )
}

function dialogKey(item: NewItem): string {
  if ('contact' in item) return `${item.kind}-${item.contact.id}`
  if ('location' in item) return `${item.kind}-${item.location.id}`
  return item.kind
}
