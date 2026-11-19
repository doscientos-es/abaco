import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import {
  RelatedCreateButton,
  useRelatedRecordCreation,
} from '@/features/clients/ui/related-record-creation'
import { convertAcceptedEstimateToContract } from '@/features/contracts/application/contract-actions'
import { listTechnicians } from '@/features/visits/application/visit-actions'
import { loadWorkTargetOptions } from '@/features/work-orders/application/work-order-actions'
import { SelectField, TextField } from '@/shared/ui/form'

export function EstimateContractConversion({
  tenantId,
  estimateId,
  clientId,
  checkingExisting,
  refreshExisting,
}: {
  tenantId: string
  estimateId: string
  clientId: string
  checkingExisting: boolean
  refreshExisting: () => Promise<unknown>
}) {
  const navigate = useNavigate()
  const [locationId, setLocationId] = useState('')
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [endsOn, setEndsOn] = useState('')
  const [technicianId, setTechnicianId] = useState('')
  const [converting, setConverting] = useState(false)
  const operationId = useRef<string | null>(null)
  const targets = useQuery({
    queryKey: ['work-target-options', tenantId, clientId],
    queryFn: () => loadWorkTargetOptions(tenantId, clientId),
  })
  const technicians = useQuery({
    queryKey: ['technicians', tenantId],
    queryFn: () => listTechnicians(tenantId),
  })
  const related = useRelatedRecordCreation({ tenantId, clientId, onLocationCreated: setLocationId })
  const locations = targets.data?.locations ?? []
  const canConvert =
    !converting &&
    !checkingExisting &&
    !related.pending &&
    locations.some(({ id }) => id === locationId) &&
    !!startsOn &&
    (!endsOn || endsOn >= startsOn)

  async function convert() {
    if (!canConvert) return
    setConverting(true)
    operationId.current ??= crypto.randomUUID()
    try {
      const contractId = await convertAcceptedEstimateToContract({
        tenantId,
        estimateId,
        locationId,
        startsOn,
        endsOn: endsOn || null,
        defaultAssignedUserId: technicianId || null,
        operationId: operationId.current,
      })
      toast.success('Contrato creado desde el presupuesto aceptado')
      void navigate({ to: '/contratos/$contractId', params: { contractId } })
    } catch (error) {
      toast.error('No se pudo crear el contrato', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await refreshExisting()
    } finally {
      setConverting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear contrato desde la versión aceptada</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          El alcance, la periodicidad y la base imponible por periodo se copian de la versión que
          aceptó el cliente. Elige dónde y cuándo comenzará el servicio.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <SelectField
              label="Centro"
              value={locationId}
              options={[
                { value: '', label: 'Selecciona un centro' },
                ...locations.map(({ id, name }) => ({ value: id, label: name })),
              ]}
              onChange={setLocationId}
            />
            {related.allowed ? (
              <RelatedCreateButton
                label="Crear centro"
                disabled={converting || related.pending || !clientId}
                onPress={() => related.start('location')}
              />
            ) : null}
          </div>
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
          <SelectField
            label="Técnico habitual"
            value={technicianId}
            options={[
              { value: '', label: 'Sin asignar' },
              ...(technicians.data ?? []).map(({ id, label }) => ({ value: id, label })),
            ]}
            onChange={setTechnicianId}
          />
        </div>
        {targets.isError ? (
          <p role="alert">
            No se pudieron cargar los centros.{' '}
            <Button variant="outline" onPress={() => void targets.refetch()}>
              Reintentar
            </Button>
          </p>
        ) : null}
        {related.status}
        <Button isDisabled={!canConvert} onPress={() => void convert()}>
          {converting ? 'Creando contrato…' : 'Crear contrato en borrador'}
        </Button>
      </CardContent>
      {related.dialogs}
    </Card>
  )
}
