import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { listTechnicians } from '@/features/visits/application/visit-actions'
import { loadWorkTargetOptions } from '@/features/work-orders/application/work-order-actions'
import { formatEuros, parseEuros } from '@/shared/domain/money'
import { useTenantData } from '@/shared/store/store'
import { SelectField, TextareaField, TextField } from '@/shared/ui/form'

import {
  createManualServiceContract,
  listServiceContracts,
  type BillingFrequency,
  type ContractStatus,
} from '../application/contract-actions'

const statusLabels: Record<ContractStatus, string> = {
  draft: 'Borrador',
  active: 'Activo',
  paused: 'Pausado',
  expired: 'Vencido',
  canceled: 'Cancelado',
}

const todayInMadrid = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

export function ContractsPage() {
  const { tenant, clients } = useTenantData()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [clientId, setClientId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [title, setTitle] = useState('')
  const [startsOn, setStartsOn] = useState(todayInMadrid)
  const [endsOn, setEndsOn] = useState('')
  const [price, setPrice] = useState('')
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>('monthly')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [included, setIncluded] = useState('')
  const [busy, setBusy] = useState(false)
  const operationIds = useRef(new Map<string, string>())
  const query = useQuery({
    queryKey: ['service-contracts', tenant.id, page],
    queryFn: () => listServiceContracts(tenant.id, page),
  })
  const targets = useQuery({
    queryKey: ['work-target-options', tenant.id, clientId],
    enabled: Boolean(clientId),
    queryFn: () => loadWorkTargetOptions(tenant.id, clientId),
  })
  const technicians = useQuery({
    queryKey: ['technicians', tenant.id],
    queryFn: () => listTechnicians(tenant.id),
  })
  const priceCents = parseEuros(price)
  const valid =
    Boolean(clientId && locationId && title.trim() && startsOn && price.trim()) &&
    /^\d+(?:[.,]\d{1,2})?$/.test(price.trim()) &&
    Number.isSafeInteger(priceCents) &&
    priceCents >= 0 &&
    (!endsOn || endsOn >= startsOn)

  async function createContract() {
    if (busy || !valid) return
    const payload = {
      tenantId: tenant.id,
      clientId,
      locationId,
      assetId: assetId || null,
      title: title.trim(),
      startsOn,
      endsOn: endsOn || null,
      priceCents,
      billingFrequency,
      defaultAssignedUserId: assignedUserId || null,
      includedScope: included
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((description) => ({ description })),
    }
    const key = JSON.stringify(payload)
    let operationId = operationIds.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operationIds.current.set(key, operationId)
    }
    setBusy(true)
    try {
      const contractId = await createManualServiceContract({ ...payload, operationId })
      operationIds.current.delete(key)
      await queryClient.invalidateQueries({ queryKey: ['service-contracts', tenant.id] })
      toast.success('Contrato creado en borrador')
      await navigate({ to: '/contratos/$contractId', params: { contractId } })
    } catch (error) {
      toast.error('No se pudo crear el contrato', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contratos de mantenimiento</h1>
        <p className="text-muted-foreground text-sm">
          Acuerdos y visitas recurrentes. La facturación periódica se incorpora después.
        </p>
      </div>
      <Button variant="outline" onPress={() => setShowForm((value) => !value)}>
        {showForm ? 'Cerrar formulario' : 'Nuevo contrato'}
      </Button>
      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo contrato manual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Cliente"
                value={clientId}
                options={[
                  { value: '', label: 'Selecciona un cliente' },
                  ...clients
                    .filter((client) => !client.archivedAt)
                    .map((client) => ({ value: client.id, label: client.name })),
                ]}
                onChange={(value) => {
                  setClientId(value)
                  setLocationId('')
                  setAssetId('')
                }}
              />
              <SelectField
                label="Ubicación"
                value={locationId}
                options={[
                  { value: '', label: 'Selecciona una ubicación' },
                  ...(targets.data?.locations ?? []).map((location) => ({
                    value: location.id,
                    label: location.name,
                  })),
                ]}
                onChange={(value) => {
                  setLocationId(value)
                  setAssetId('')
                }}
              />
              <SelectField
                label="Piscina o activo"
                value={assetId}
                options={[
                  { value: '', label: 'Sin activo concreto' },
                  ...(targets.data?.assets ?? [])
                    .filter((asset) => asset.location_id === locationId)
                    .map((asset) => ({ value: asset.id, label: asset.name })),
                ]}
                onChange={setAssetId}
              />
              <TextField
                label="Título"
                value={title}
                onChange={setTitle}
                placeholder="Mantenimiento de piscina"
                maxLength={200}
              />
              <TextField
                label="Inicio"
                type="date"
                value={startsOn}
                onChange={setStartsOn}
                placeholder="Fecha de inicio"
              />
              <TextField
                label="Fin, si está pactado"
                type="date"
                value={endsOn}
                onChange={setEndsOn}
                placeholder="Sin fecha de fin"
              />
              <TextField
                label="Precio por periodo, sin IVA (€)"
                value={price}
                onChange={setPrice}
                placeholder="0,00"
              />
              <SelectField
                label="Facturación prevista"
                value={billingFrequency}
                options={[
                  { value: 'monthly', label: 'Mensual' },
                  { value: 'quarterly', label: 'Trimestral' },
                  { value: 'yearly', label: 'Anual' },
                ]}
                onChange={(value) => setBillingFrequency(value as BillingFrequency)}
              />
              <SelectField
                label="Técnico habitual"
                value={assignedUserId}
                options={[
                  { value: '', label: 'Pendiente de asignar' },
                  ...(technicians.data ?? []).map((person) => ({
                    value: person.id,
                    label: person.label,
                  })),
                ]}
                onChange={setAssignedUserId}
              />
              <TextareaField
                label="Servicios incluidos, uno por línea"
                value={included}
                onChange={setIncluded}
                placeholder="Revisión de agua y depuradora"
                className="sm:col-span-2"
              />
            </div>
            <Button isDisabled={busy || !valid} onPress={() => void createContract()}>
              {busy ? 'Creando…' : 'Crear borrador'}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {query.isPending ? <output>Cargando contratos…</output> : null}
      {query.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar los contratos: {query.error.message}
        </p>
      ) : null}
      {query.data?.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aún no hay contratos.</p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {query.data?.items.map((contract) => (
          <li key={contract.id}>
            <Card className="h-full">
              <CardContent className="space-y-2 p-4">
                <Link
                  to="/contratos/$contractId"
                  params={{ contractId: contract.id }}
                  className="text-primary font-semibold underline-offset-4 hover:underline"
                >
                  {contract.title}
                </Link>
                <p className="text-muted-foreground text-sm">
                  {clients.find((client) => client.id === contract.client_id)?.name ?? 'Cliente'} ·{' '}
                  {statusLabels[contract.status]}
                </p>
                <p className="text-sm">
                  {formatEuros(contract.price_cents)} /{' '}
                  {contract.billing_frequency === 'monthly'
                    ? 'mes'
                    : contract.billing_frequency === 'quarterly'
                      ? 'trimestre'
                      : 'año'}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between text-sm">
        <span>{query.data?.count ?? 0} contratos</span>
        <div className="flex gap-2">
          <Button variant="outline" isDisabled={page === 0} onPress={() => setPage(page - 1)}>
            Anterior
          </Button>
          <Button
            variant="outline"
            isDisabled={!query.data || (page + 1) * query.data.pageSize >= query.data.count}
            onPress={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
