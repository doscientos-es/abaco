import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import { formatEuros } from '@/shared/domain/money'
import { useTenantData } from '@/shared/store/store'
import { SelectField, TextField } from '@/shared/ui/form'

import {
  addContractVisitRule,
  generateContractVisits,
  loadServiceContract,
  transitionServiceContract,
  type ContractStatus,
  type ContractVisitRule,
} from '../application/contract-actions'
import { ContractBillingPanel } from './contract-billing-panel'
import { ContractCostsPanel } from './contract-costs-panel'
import { ContractProfitabilityPanel } from './contract-profitability-panel'

const monthNames = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const statusLabels: Record<ContractStatus, string> = {
  draft: 'Borrador',
  active: 'Activo',
  paused: 'Pausado',
  expired: 'Vencido',
  canceled: 'Cancelado',
}

function describeRule(rule: ContractVisitRule) {
  return `${weekdays[rule.weekday - 1]} a las ${rule.local_start.slice(0, 5)} · ${rule.duration_minutes} min · ${rule.every_n_weeks === 1 ? 'semanal' : `cada ${rule.every_n_weeks} semanas`}`
}

export function ContractDetailPage({ contractId }: { contractId: string }) {
  const { tenant, clients } = useTenantData()
  const session = useSession()
  const queryClient = useQueryClient()
  const [season, setSeason] = useState<ContractVisitRule['season']>('high')
  const [months, setMonths] = useState<number[]>([6, 7, 8, 9])
  const [weekday, setWeekday] = useState('1')
  const [everyNWeeks, setEveryNWeeks] = useState('1')
  const [localStart, setLocalStart] = useState('09:00')
  const [duration, setDuration] = useState('60')
  const [ruleTitle, setRuleTitle] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const operationIds = useRef(new Map<string, string>())
  const queryKey = ['service-contract', tenant.id, contractId]
  const query = useQuery({
    queryKey,
    queryFn: () => loadServiceContract(tenant.id, contractId),
  })
  const contract = query.data?.contract
  const validRule =
    months.length > 0 &&
    ruleTitle.trim().length > 0 &&
    ruleTitle.trim().length <= 200 &&
    Number.isInteger(Number(duration)) &&
    Number(duration) >= 15 &&
    Number(duration) <= 720 &&
    /^\d{2}:\d{2}$/.test(localStart)

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['service-contracts', tenant.id] }),
    ])
  }

  function stableOperation(key: string) {
    let operationId = operationIds.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operationIds.current.set(key, operationId)
    }
    return operationId
  }

  async function addRule() {
    if (!contract || busy || !validRule) return
    const payload = {
      tenantId: tenant.id,
      contractId,
      expectedUpdatedAt: contract.updated_at,
      season,
      months: [...months].sort((a, b) => a - b),
      weekday: Number(weekday),
      everyNWeeks: Number(everyNWeeks),
      localStart,
      durationMinutes: Number(duration),
      title: ruleTitle.trim(),
    }
    const key = `rule:${JSON.stringify(payload)}`
    const operationId = stableOperation(key)
    setBusy('rule')
    try {
      await addContractVisitRule({ ...payload, operationId })
      operationIds.current.delete(key)
      setRuleTitle('')
      await refresh()
      toast.success('Frecuencia añadida')
    } catch (error) {
      toast.error('No se pudo añadir la frecuencia', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  async function transition(nextStatus: Exclude<ContractStatus, 'draft'>) {
    if (!contract || busy) return
    if (nextStatus !== 'active' && !reason.trim()) return
    const payload = {
      tenantId: tenant.id,
      contractId,
      expectedUpdatedAt: contract.updated_at,
      nextStatus,
      reason: reason.trim(),
    }
    const key = `status:${JSON.stringify(payload)}`
    const operationId = stableOperation(key)
    setBusy(nextStatus)
    try {
      await transitionServiceContract({ ...payload, operationId })
      operationIds.current.delete(key)
      setReason('')
      await refresh()
      await queryClient.invalidateQueries({ queryKey: ['office-visits', tenant.id] })
      toast.success(`Contrato ${statusLabels[nextStatus].toLowerCase()}`)
    } catch (error) {
      toast.error('No se pudo cambiar el contrato', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  async function generate() {
    if (busy) return
    setBusy('generate')
    try {
      const count = await generateContractVisits(tenant.id)
      await refresh()
      await queryClient.invalidateQueries({ queryKey: ['office-visits', tenant.id] })
      toast.success(`${count} visitas nuevas generadas`)
    } catch (error) {
      toast.error('No se pudieron generar las visitas', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(null)
    }
  }

  if (query.isPending) return <output>Cargando contrato…</output>
  if (query.isError || !contract) {
    return (
      <p role="alert" className="text-destructive">
        No se pudo cargar el contrato: {query.error?.message ?? 'No encontrado'}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/contratos" className="text-primary text-sm underline">
        Volver a contratos
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{contract.title}</h1>
        <p className="text-muted-foreground text-sm">
          {clients.find((client) => client.id === contract.client_id)?.name ?? 'Cliente'} ·{' '}
          {statusLabels[contract.status]} · {contract.timezone}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Acuerdo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Desde {contract.starts_on}
            {contract.ends_on ? ` hasta ${contract.ends_on}` : ' sin fecha de fin'} ·{' '}
            {formatEuros(contract.price_cents)} /{' '}
            {contract.billing_frequency === 'monthly'
              ? 'mes'
              : contract.billing_frequency === 'quarterly'
                ? 'trimestre'
                : 'año'}
          </p>
          <p className="text-muted-foreground">
            El importe es la condición pactada. La generación de cuotas y facturas sigue pendiente.
          </p>
          {contract.included_scope.length ? (
            <ul className="list-inside list-disc">
              {contract.included_scope.map((item, index) => (
                <li key={`${item.description}:${index}`}>{item.description}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {can(session?.role, 'work:costs') ? (
        <ContractBillingPanel
          tenantId={tenant.id}
          contractId={contract.id}
          canGenerate={contract.status !== 'draft'}
          timezone={contract.timezone}
          priceCents={contract.price_cents}
        />
      ) : null}

      {can(session?.role, 'work:costs') ? (
        <ContractProfitabilityPanel tenantId={tenant.id} contractId={contract.id} />
      ) : null}

      {can(session?.role, 'work:costs') ? (
        <ContractCostsPanel
          tenantId={tenant.id}
          contractId={contract.id}
          visits={query.data.visits}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Frecuencia por temporada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {query.data.rules.length ? (
            <ul className="space-y-2 text-sm">
              {query.data.rules.map((rule) => (
                <li key={rule.id} className="rounded-lg border p-3">
                  <p className="font-medium">
                    {rule.title} · {rule.season === 'high' ? 'Temporada alta' : 'Temporada baja'}
                  </p>
                  <p className="text-muted-foreground">
                    {describeRule(rule)} · meses{' '}
                    {rule.months.map((month) => monthNames[month - 1]).join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              Añade una frecuencia antes de activar el contrato.
            </p>
          )}
          {contract.status === 'draft' ? (
            <div className="space-y-3 border-t pt-4">
              <h2 className="font-medium">Añadir frecuencia</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Temporada"
                  value={season}
                  options={[
                    { value: 'high', label: 'Alta' },
                    { value: 'low', label: 'Baja' },
                  ]}
                  onChange={(value) => {
                    setSeason(value as ContractVisitRule['season'])
                    setMonths(value === 'high' ? [6, 7, 8, 9] : [1, 2, 3, 4, 5, 10, 11, 12])
                  }}
                />
                <TextField
                  label="Nombre de la visita"
                  value={ruleTitle}
                  onChange={setRuleTitle}
                  placeholder="Revisión de piscina"
                  maxLength={200}
                />
                <SelectField
                  label="Día"
                  value={weekday}
                  options={weekdays.map((name, index) => ({
                    value: String(index + 1),
                    label: name,
                  }))}
                  onChange={setWeekday}
                />
                <SelectField
                  label="Periodicidad"
                  value={everyNWeeks}
                  options={[
                    { value: '1', label: 'Cada semana' },
                    { value: '2', label: 'Cada 2 semanas' },
                    { value: '4', label: 'Cada 4 semanas' },
                  ]}
                  onChange={setEveryNWeeks}
                />
                <TextField
                  label="Hora local"
                  type="time"
                  value={localStart}
                  onChange={setLocalStart}
                  placeholder="09:00"
                />
                <TextField
                  label="Duración, minutos"
                  type="number"
                  value={duration}
                  onChange={setDuration}
                  placeholder="60"
                  min={15}
                  max={720}
                />
              </div>
              <fieldset>
                <legend className="text-sm font-medium">Meses de aplicación</legend>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {monthNames.map((name, index) => {
                    const month = index + 1
                    return (
                      <label key={month} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={months.includes(month)}
                          onChange={(event) =>
                            setMonths((current) =>
                              event.target.checked
                                ? [...current, month]
                                : current.filter((value) => value !== month),
                            )
                          }
                        />
                        {name}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
              <Button isDisabled={Boolean(busy) || !validRule} onPress={() => void addRule()}>
                {busy === 'rule' ? 'Guardando…' : 'Añadir frecuencia'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {contract.status !== 'expired' && contract.status !== 'canceled' ? (
        <Card>
          <CardHeader>
            <CardTitle>Estado y generación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {contract.status !== 'draft' ? (
              <TextField
                label="Motivo de la pausa o cancelación"
                value={reason}
                onChange={setReason}
                placeholder="Describe el motivo"
                maxLength={500}
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              {contract.status === 'draft' || contract.status === 'paused' ? (
                <Button isDisabled={Boolean(busy)} onPress={() => void transition('active')}>
                  {contract.status === 'draft' ? 'Activar' : 'Reanudar'}
                </Button>
              ) : null}
              {contract.status === 'active' ? (
                <>
                  <Button
                    variant="outline"
                    isDisabled={Boolean(busy)}
                    onPress={() => void generate()}
                  >
                    Generar agenda de contratos
                  </Button>
                  <Button
                    variant="outline"
                    isDisabled={Boolean(busy) || !reason.trim()}
                    onPress={() => void transition('paused')}
                  >
                    Pausar
                  </Button>
                </>
              ) : null}
              <Button
                variant="outline"
                isDisabled={Boolean(busy) || !reason.trim()}
                onPress={() => void transition('canceled')}
              >
                Cancelar contrato
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              La generación diaria incluye todos los contratos activos de la empresa y usa un
              horizonte de 30 días por defecto. Repetirla no duplica visitas. Los conflictos quedan
              pendientes de asignación.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Visitas generadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {query.data.visits.length === 0 ? (
            <p className="text-muted-foreground">Aún no hay visitas generadas.</p>
          ) : (
            <ul className="divide-y">
              {query.data.visits.map((visit) => (
                <li key={visit.id} className="py-2">
                  <p className="font-medium">{visit.title}</p>
                  <p className="text-muted-foreground">
                    {new Date(visit.scheduled_start_at).toLocaleString('es-ES', {
                      timeZone: contract.timezone,
                    })}{' '}
                    · {visit.status} · versión {visit.contract_schedule_version}
                    {visit.assigned_user_id ? '' : ' · Pendiente de asignar'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {query.data.issues.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Conflictos de generación</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {query.data.issues.map((issue) => (
                <li key={issue.id} className="rounded-lg border p-3">
                  {issue.occurrence_on}: {issue.detail}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Historial del contrato</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            {query.data.events.map((event) => (
              <li key={event.id}>
                {new Date(event.occurred_at).toLocaleString('es-ES')} ·{' '}
                {event.kind === 'created'
                  ? 'Creado'
                  : event.kind === 'rule_added'
                    ? 'Frecuencia añadida'
                    : 'Estado cambiado'}
                {typeof event.payload.reason === 'string' && event.payload.reason
                  ? ` · ${event.payload.reason}`
                  : ''}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
