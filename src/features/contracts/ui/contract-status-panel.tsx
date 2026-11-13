import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import { TextField } from '@/shared/ui/form'

import { transitionServiceContract, type ServiceContract } from '../application/contract-actions'
import { contractStatusLabels } from '../domain/contract-status'
import { contractDatesError } from '../domain/weekly-schedule'
import { ContractStatusBadge } from './contract-status-badge'

export function ContractStatusPanel({ contract }: { contract: ServiceContract }) {
  const session = useSession()
  const cache = useQueryClient()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const operations = useRef(new Map<string, string>())
  const active = contract.status === 'active'
  const closed = contract.status === 'expired' || contract.status === 'canceled'
  const writable = can(session?.role, 'contracts:write')

  async function refresh() {
    await Promise.all(
      [
        'service-contract',
        'service-contracts',
        'contract-jobs',
        'office-visits',
        'contract-billing-periods',
      ].map((key) => cache.invalidateQueries({ queryKey: [key, contract.tenant_id] })),
    )
  }

  async function changeStatus() {
    if (!writable || closed || busy || (active && !reason.trim())) return
    const dateError = contractDatesError(contract.starts_on, contract.ends_on ?? '')
    if (!active && dateError) {
      toast.error(dateError)
      return
    }
    const nextStatus = active ? 'paused' : 'active'
    const payload = {
      tenantId: contract.tenant_id,
      contractId: contract.id,
      expectedUpdatedAt: contract.updated_at,
      nextStatus,
      reason: active ? reason.trim() : '',
    } as const
    const key = JSON.stringify(payload)
    const operationId = operations.current.get(key) ?? crypto.randomUUID()
    operations.current.set(key, operationId)
    setBusy(true)
    try {
      await transitionServiceContract({ ...payload, operationId })
      operations.current.delete(key)
      setReason('')
      await refresh()
      toast.success(`Contrato ${contractStatusLabels[nextStatus].toLowerCase()}`)
    } catch (error) {
      toast.error('No se pudo cambiar el estado del contrato', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado del contrato</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ContractStatusBadge status={contract.status} />
        {closed ? (
          <p className="text-muted-foreground text-sm">
            {contract.status === 'expired'
              ? 'El contrato ha vencido y se conserva para consulta.'
              : 'El contrato fue cancelado y se conserva para consulta.'}
          </p>
        ) : writable ? (
          <div className="space-y-3">
            {active ? (
              <TextField
                label="Motivo de la desactivación"
                value={reason}
                onChange={setReason}
                placeholder="Describe el motivo"
                maxLength={500}
              />
            ) : null}
            <p className="text-muted-foreground text-sm">
              {active
                ? 'Al desactivar se cancelarán las visitas futuras pendientes. Podrás volver a activar el contrato.'
                : contract.status === 'draft'
                  ? 'Configura las fechas y los trabajos antes de activar. Al activar se generarán los trabajos del contrato.'
                  : 'El contrato no genera nuevos trabajos mientras está inactivo. Al activar se reanudará la generación.'}
            </p>
            <Button
              onPress={() => void changeStatus()}
              variant={active ? 'outline' : 'default'}
              isDisabled={busy || (active && !reason.trim())}
            >
              {busy ? 'Guardando…' : active ? 'Desactivar contrato' : 'Activar contrato'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
