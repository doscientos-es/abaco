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
import { lazy, Suspense, useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import { CentreProtocolDialog } from '@/features/centre-protocols'
import { IncidentPanel } from '@/features/incidents/ui/incident-panel'
import { ClientVisitHistory } from '@/features/visits/ui/client-visit-history'
import { contactWhatsappNumber } from '@/shared/lib/contact-links'
import { useTenantData } from '@/shared/store/store'
import { ClientWhatsappAction, VisitMapsAction } from '@/shared/ui/contact-actions'
import { PageNotFound } from '@/shared/ui/page-states'

import { loadHandoffIncidents, loadHandoffTiming } from '../application/client-handoff-actions'
import { loadClientPassport } from '../application/client-passport-actions'
import { ClientCommercialOverview } from './client-commercial-overview'
import { ClientHandoffPanel } from './client-handoff-panel'
import { CreatePassportItem, contactRoles, type NewItem } from './client-passport-dialog'
import { StaffArrivalDialog } from './staff-arrival-dialog'

const CentreEquipmentLabelsDialog = lazy(
  () => import('@/features/equipment-labels/ui/centre-equipment-labels-dialog'),
)

export function ClientPassportPage({ clientId }: { clientId: string }) {
  const { tenant, clients, estimates, invoices } = useTenantData()
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
  const [protocolLocation, setProtocolLocation] = useState<{ id: string; name: string } | null>(
    null,
  )
  const [equipmentLocation, setEquipmentLocation] = useState<{ id: string; name: string } | null>(
    null,
  )
  const [arrivalLocation, setArrivalLocation] = useState<{ id: string; name: string } | null>(null)
  const handoffKey = `${tenant.id}:${clientId}:${session?.userId ?? ''}`
  const [handoff, setHandoff] = useState<{ key: string; location: string | null } | null>(null)
  const handoffHeading = useRef<HTMLHeadingElement>(null)
  const canWrite = can(session?.role, 'clients:write')
  const canReviewHandoff =
    session?.tenantId === tenant.id &&
    can(session.role, 'clients:read') &&
    can(session.role, 'visits:read')
  const canReviewHandoffIncidents = canWrite && can(session?.role, 'visits:write')

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
  const activeContacts = data?.contacts.filter((contact) => contact.active) ?? []
  const phoneNumber = contactWhatsappNumber(client.phone)
  const emailAddress = /^[^@\s?&#]+@[^@\s?&#]+$/.test(client.email ?? '') ? client.email : null
  const contactClass =
    'text-primary focus-visible:ring-ring inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium focus-visible:ring-2'
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

      {canReviewHandoff && session && data ? (
        <ClientHandoffPanel
          key={handoffKey}
          tenantId={tenant.id}
          userId={session.userId}
          clientId={clientId}
          locations={data.locations}
          location={handoff?.key === handoffKey ? handoff.location : null}
          onLocationChange={(location) => setHandoff({ key: handoffKey, location })}
          headingRef={handoffHeading}
          loadTiming={loadHandoffTiming}
          loadIncidents={canReviewHandoffIncidents ? loadHandoffIncidents : undefined}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Contacto principal</CardTitle>
        </CardHeader>
        <CardContent>
          {client.phone ? <p className="text-sm break-words">Teléfono: {client.phone}</p> : null}
          {phoneNumber || emailAddress ? (
            <div className="my-2 flex flex-wrap gap-2">
              {phoneNumber ? (
                <a className={contactClass} href={`tel:+${phoneNumber}`}>
                  Llamar
                </a>
              ) : null}
              {emailAddress ? (
                <a className={contactClass} href={`mailto:${emailAddress}`}>
                  Escribir email
                </a>
              ) : null}
            </div>
          ) : null}
          <ClientWhatsappAction
            phone={client.phone}
            label={`Abrir WhatsApp del cliente ${client.name}`}
          />
        </CardContent>
      </Card>

      <ClientCommercialOverview
        tenantId={tenant.id}
        clientId={clientId}
        estimates={can(session?.role, 'estimates:read') ? estimates : null}
        invoices={can(session?.role, 'invoices:read') ? invoices : null}
      />

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
              {activeContacts.length ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {activeContacts.map((contact) => (
                    <li key={contact.id} className="border-border rounded-lg border p-3 text-sm">
                      <p className="font-medium">{contact.name}</p>
                      <p className="text-muted-foreground">
                        {contactRoles.find((role) => role.value === contact.role)?.label}
                      </p>
                      {contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : null}
                      <ClientWhatsappAction
                        phone={contact.phone}
                        label={`Abrir WhatsApp de ${contact.name}`}
                      />
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
                    <VisitMapsAction
                      showAddress={false}
                      coordinates={{ latitude: location.latitude, longitude: location.longitude }}
                      address={
                        location.address?.trim()
                          ? [location.address, location.postal_code, location.city]
                              .filter((part) => part?.trim())
                              .map((part) => part.trim())
                              .join(', ')
                          : ''
                      }
                      label={`Cómo llegar al centro ${location.name} en Google Maps`}
                    />
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
                  {location.opening_hours ? (
                    <p className="text-sm whitespace-pre-wrap">Horario: {location.opening_hours}</p>
                  ) : null}
                  <p className="text-sm whitespace-pre-wrap">{location.operational_contact}</p>
                  <p className="text-sm whitespace-pre-wrap">{location.access_notes}</p>
                  <p className="text-sm whitespace-pre-wrap">{location.notes}</p>
                  {canReviewHandoff ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      aria-label={`Ver relevo de ${location.name}`}
                      onPress={() => {
                        setHandoff({ key: handoffKey, location: location.id })
                        handoffHeading.current?.focus()
                      }}
                    >
                      Relevo de este centro
                    </Button>
                  ) : null}
                  {canWrite && location.active && location.kind !== 'billing' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      aria-label={`Llegada para técnicos en ${location.name}`}
                      onPress={() => setArrivalLocation({ id: location.id, name: location.name })}
                    >
                      Llegada para técnicos
                    </Button>
                  ) : null}
                  {canWrite && location.active && location.kind !== 'billing' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      aria-label={`Protocolo operativo de ${location.name}`}
                      onPress={() => setProtocolLocation({ id: location.id, name: location.name })}
                    >
                      Protocolo operativo
                    </Button>
                  ) : null}
                  {canWrite && location.active && location.kind !== 'billing' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      aria-label={`Etiquetas de equipos en ${location.name}`}
                      onPress={() => setEquipmentLocation({ id: location.id, name: location.name })}
                    >
                      Etiquetas QR
                    </Button>
                  ) : null}
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

      {canWrite && arrivalLocation && session?.userId ? (
        <StaffArrivalDialog
          key={`${tenant.id}:${session.userId}:${arrivalLocation.id}`}
          tenantId={tenant.id}
          userId={session.userId}
          locationId={arrivalLocation.id}
          locationName={arrivalLocation.name}
          onClose={() => setArrivalLocation(null)}
        />
      ) : null}
      {canWrite && protocolLocation && session?.userId ? (
        <CentreProtocolDialog
          key={`${tenant.id}:${session.userId}:${protocolLocation.id}`}
          tenantId={tenant.id}
          userId={session.userId}
          locationId={protocolLocation.id}
          locationName={protocolLocation.name}
          onClose={() => setProtocolLocation(null)}
        />
      ) : null}
      {canWrite && equipmentLocation && session?.userId ? (
        <Suspense fallback={<output>Cargando etiquetas QR…</output>}>
          <CentreEquipmentLabelsDialog
            key={`${tenant.id}:${session.userId}:${equipmentLocation.id}`}
            tenantId={tenant.id}
            userId={session.userId}
            locationId={equipmentLocation.id}
            name={equipmentLocation.name}
            onClose={() => setEquipmentLocation(null)}
          />
        </Suspense>
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
