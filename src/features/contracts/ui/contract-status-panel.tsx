import { Button, toast } from '@doscientos/ui'
import { CheckCircle, Circle, WarningCircle } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import { workTeamsQuery } from '@/features/work-teams'
import { TextField } from '@/shared/ui/form'

import { listCleaningServices } from '../application/cleaning-service-actions'
import { transitionServiceContract, type ServiceContract } from '../application/contract-actions'
import { contractStatusLabels } from '../domain/contract-status'
import { contractDatesError } from '../domain/weekly-schedule'
import { ContractStatusBadge } from './contract-status-badge'

export function ContractStatusPanel({ contract }: { contract: ServiceContract }) {
  const session = useSession()
  const cache = useQueryClient()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [transitionError, setTransitionError] = useState('')
  const operations = useRef(new Map<string, string>())
  const active = contract.status === 'active'
  const closed = contract.status === 'expired' || contract.status === 'canceled'
  const writable = can(session?.role, 'contracts:write')
  const checking = !active && !closed
  const jobs = useQuery({
    queryKey: ['cleaning-services', contract.tenant_id, contract.id],
    queryFn: () => listCleaningServices(contract.tenant_id, contract.id),
    enabled: checking,
  })
  const teamIds = jobs.data?.some((job) => job.frequency !== null)
    ? jobs.data.flatMap((job) => (job.work_team_id ? [job.work_team_id] : []))
    : []
  const teams = useQuery({
    ...workTeamsQuery(contract.tenant_id),
    enabled: checking && teamIds.length > 0,
  })
  const dateError = contractDatesError(contract.starts_on, contract.ends_on ?? '')
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: contract.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const dateIssue =
    dateError ?? (contract.ends_on && contract.ends_on < today ? 'El contrato está vencido.' : null)
  const pendingJobs = jobs.data?.filter((job) => !job.configured).length ?? 0
  const jobIssue = jobs.isError
    ? 'No se pudieron comprobar los trabajos.'
    : jobs.isPending
      ? 'Comprobando trabajos…'
      : !jobs.data?.length
        ? 'Añade al menos un trabajo.'
        : pendingJobs
          ? `${pendingJobs} ${pendingJobs === 1 ? 'trabajo pendiente de configurar' : 'trabajos pendientes de configurar'}.`
          : teamIds.length && teams.isError
            ? 'No se pudieron comprobar los equipos.'
            : teamIds.length && teams.isPending
              ? 'Comprobando equipos…'
              : teamIds.some((id) => !teams.data?.some((team) => team.id === id && !team.archived))
                ? 'Hay equipos asignados que ya no están disponibles.'
                : null
  const canActivate = checking && !dateIssue && !jobIssue

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
    if (!writable || closed || busy || (active ? !reason.trim() : !canActivate)) return
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
    setTransitionError('')
    try {
      await transitionServiceContract({ ...payload, operationId })
      operations.current.delete(key)
      setReason('')
      await refresh()
      toast.success(`Contrato ${contractStatusLabels[nextStatus].toLowerCase()}`)
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : 'Inténtalo de nuevo.')
      toast.error('No se pudo cambiar el estado del contrato', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-border bg-card space-y-4 rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Estado del contrato</h3>
          {checking ? (
            <p className="text-muted-foreground mt-1 text-sm">
              {canActivate
                ? 'Requisitos principales completos'
                : 'Revisa los requisitos para activar'}
            </p>
          ) : null}
        </div>
        <ContractStatusBadge status={contract.status} />
      </div>
      {closed ? (
        <p className="text-muted-foreground text-sm">
          {contract.status === 'expired'
            ? 'El contrato ha vencido y se conserva para consulta.'
            : 'El contrato fue cancelado y se conserva para consulta.'}
        </p>
      ) : (
        <div className="space-y-3">
          {checking ? (
            <ul className="space-y-2 text-sm" aria-label="Requisitos de activación">
              <li className="flex items-start gap-2">
                {dateIssue ? (
                  <WarningCircle
                    aria-hidden="true"
                    className="text-warning mt-0.5 size-4 shrink-0"
                  />
                ) : (
                  <CheckCircle aria-hidden="true" className="text-success mt-0.5 size-4 shrink-0" />
                )}
                <span>{dateIssue ?? 'Fechas válidas'}</span>
              </li>
              <li className="flex items-start gap-2">
                {jobIssue ? (
                  <Circle
                    aria-hidden="true"
                    className="text-muted-foreground mt-0.5 size-4 shrink-0"
                  />
                ) : (
                  <CheckCircle aria-hidden="true" className="text-success mt-0.5 size-4 shrink-0" />
                )}
                <span>{jobIssue ?? 'Trabajos configurados'}</span>
              </li>
            </ul>
          ) : null}
          {checking && (jobs.isError || (teamIds.length > 0 && teams.isError)) ? (
            <Button
              size="sm"
              variant="outline"
              onPress={() => {
                void jobs.refetch()
                if (teamIds.length) void teams.refetch()
              }}
            >
              Reintentar comprobación
            </Button>
          ) : null}
          {active && writable ? (
            <TextField
              label="Motivo de la desactivación"
              value={reason}
              onChange={setReason}
              placeholder="Describe el motivo"
              maxLength={500}
            />
          ) : null}
          {active && writable ? (
            <p className="text-muted-foreground text-xs">
              Al desactivar se cancelarán las visitas futuras pendientes.
            </p>
          ) : null}
          {transitionError ? (
            <p role="alert" className="text-destructive text-sm">
              {transitionError}
            </p>
          ) : null}
          {writable ? (
            <Button
              size="sm"
              onPress={() => void changeStatus()}
              variant={active ? 'outline' : 'default'}
              isDisabled={busy || (active ? !reason.trim() : !canActivate)}
            >
              {busy ? 'Guardando…' : active ? 'Desactivar contrato' : 'Activar contrato'}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
