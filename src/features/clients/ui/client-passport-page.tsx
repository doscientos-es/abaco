import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  toast,
} from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { can, useSession } from '@/features/auth'
import { IncidentPanel } from '@/features/incidents/ui/incident-panel'
import { useTenantData } from '@/shared/store/store'
import { PageNotFound } from '@/shared/ui/page-states'

import {
  loadClientPassport,
  setAssetStatus,
  setEquipmentStatus,
  type ClientPassport,
} from '../application/client-passport-actions'
import { AssetCard } from './asset-card'
import { CreatePassportItem, contactRoles, type NewItem } from './client-passport-dialog'
import { TransferEquipmentDialog } from './transfer-equipment-dialog'

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
  const [changing, setChanging] = useState<string | null>(null)
  const [transferring, setTransferring] = useState<ClientPassport['equipment'][number] | null>(null)
  const canWrite = can(session?.role, 'clients:write')

  async function changeAssetStatus(
    asset: ClientPassport['assets'][number],
    status: ClientPassport['assets'][number]['status'],
  ) {
    if (status === asset.status || changing) return
    setChanging(asset.id)
    try {
      await setAssetStatus(tenant.id, asset, status)
      await queryClient.invalidateQueries({ queryKey })
      toast.success('Estado del activo actualizado')
    } catch (error) {
      toast.error('No se cambió el estado', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await queryClient.invalidateQueries({ queryKey })
    } finally {
      setChanging(null)
    }
  }

  async function changeEquipmentStatus(
    equipment: ClientPassport['equipment'][number],
    status: 'active' | 'retired',
  ) {
    if (status === equipment.status || changing) return
    setChanging(equipment.id)
    try {
      await setEquipmentStatus(tenant.id, equipment, status)
      await queryClient.invalidateQueries({ queryKey })
      toast.success('Estado del equipo actualizado')
    } catch (error) {
      toast.error('No se cambió el estado', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await queryClient.invalidateQueries({ queryKey })
    } finally {
      setChanging(null)
    }
  }

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
          <PageHeaderDescription>
            Contactos, ubicaciones, piscinas y equipos del cliente.
          </PageHeaderDescription>
        </PageHeaderHeading>
        <PageHeaderActions>
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
                          <Button
                            size="sm"
                            variant="ghost"
                            onPress={() => setCreating({ kind: 'editContact', contact })}
                          >
                            Editar
                          </Button>
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
                Ubicaciones e instalaciones
              </h2>
              {canWrite ? (
                <Button onPress={() => setCreating({ kind: 'location' })}>Añadir ubicación</Button>
              ) : null}
            </div>
            {data.locations.filter((location) => location.active).length === 0 ? (
              <p className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
                Añade la primera ubicación de servicio o facturación de este cliente.
              </p>
            ) : null}
            {data.locations
              .filter((location) => location.active)
              .map((location) => (
                <Card key={location.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div>
                      <CardTitle>{location.name}</CardTitle>
                      <p className="text-muted-foreground text-sm">
                        {location.address}
                        {location.city ? ` · ${location.city}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canWrite ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => setCreating({ kind: 'editLocation', location })}
                        >
                          Editar ubicación
                        </Button>
                      ) : null}
                      {canWrite && location.kind !== 'billing' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onPress={() => setCreating({ kind: 'pool', locationId: location.id })}
                        >
                          Añadir piscina
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.assets.filter((asset) => asset.location_id === location.id).length ===
                    0 ? (
                      <p className="text-muted-foreground text-sm">No hay activos registrados.</p>
                    ) : null}
                    {data.assets
                      .filter((asset) => asset.location_id === location.id)
                      .map((asset) => (
                        <AssetCard
                          key={asset.id}
                          tenantId={tenant.id}
                          asset={asset}
                          data={data}
                          canWrite={canWrite}
                          changing={changing}
                          onAssetStatus={(status) => void changeAssetStatus(asset, status)}
                          onEquipmentStatus={(equipment, status) =>
                            void changeEquipmentStatus(equipment, status)
                          }
                          onEditPool={(profile) =>
                            setCreating({ kind: 'editPool', asset, profile })
                          }
                          onEditEquipment={(equipment) =>
                            setCreating({ kind: 'editEquipment', equipment })
                          }
                          onReplaceEquipment={(equipment) =>
                            setCreating({ kind: 'replaceEquipment', equipment })
                          }
                          onTransferEquipment={setTransferring}
                          onAddEquipment={() =>
                            setCreating({ kind: 'equipment', assetId: asset.id })
                          }
                        />
                      ))}
                  </CardContent>
                </Card>
              ))}
          </section>
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
          }}
          onError={() => void queryClient.invalidateQueries({ queryKey })}
        />
      ) : null}
      {transferring && data ? (
        <TransferEquipmentDialog
          key={transferring.id}
          tenantId={tenant.id}
          equipment={transferring}
          targets={data.assets
            .filter(
              (asset) =>
                asset.id !== transferring.asset_id &&
                (asset.status === 'active' || asset.status === 'out_of_season') &&
                data.locations.some(
                  (location) => location.id === asset.location_id && location.active,
                ),
            )
            .map((asset) => ({
              value: asset.id,
              label: `${data.locations.find((location) => location.id === asset.location_id)?.name ?? 'Ubicación'} · ${asset.name}`,
            }))}
          onClose={() => setTransferring(null)}
          onSaved={() => {
            setTransferring(null)
            void queryClient.invalidateQueries({ queryKey })
          }}
        />
      ) : null}
    </div>
  )
}

function dialogKey(item: NewItem): string {
  if ('locationId' in item) return `${item.kind}-${item.locationId}`
  if ('assetId' in item) return `${item.kind}-${item.assetId}`
  if ('contact' in item) return `${item.kind}-${item.contact.id}`
  if ('location' in item) return `${item.kind}-${item.location.id}`
  if ('asset' in item) return `${item.kind}-${item.asset.id}`
  if ('equipment' in item) return `${item.kind}-${item.equipment.id}`
  return item.kind
}
