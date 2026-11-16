import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import { useTenantData } from '@/shared/store/store'
import { SelectField, TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import {
  addContractVisitRule,
  generateContractVisits,
  loadServiceContract,
  type ContractVisitRule,
} from '../application/contract-actions'
import { CleaningServicesPanel } from './cleaning-services-panel'
import { ContractActions } from './contract-actions'
import { ContractAssignmentsPanel } from './contract-assignments-panel'
import { ContractBillingPanel } from './contract-billing-panel'
import { ContractCostsPanel } from './contract-costs-panel'
import { ContractDocument, type ContractDocumentHandle } from './contract-document'
import { ContractProfitabilityPanel } from './contract-profitability-panel'
import { ContractStatusBadge } from './contract-status-badge'
import { ContractSummary } from './contract-summary'

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
function describeRule(rule: ContractVisitRule, preferredStart: string) {
  return `${weekdays[rule.weekday - 1]} a las ${preferredStart.slice(0, 5)} · ${rule.duration_minutes} min · ${rule.every_n_weeks === 1 ? 'semanal' : `cada ${rule.every_n_weeks} semanas`}`
}

export function ContractDetailPage({ contractId }: { contractId: string }) {
  const { tenant, clients } = useTenantData()
  const session = useSession()
  const queryClient = useQueryClient()
  const hash = useRouterState({ select: (state) => state.location.hash })
  const [tab, setTab] = useState(() => (hash ? 'trabajos' : 'resumen'))
  useEffect(() => {
    if (hash) setTab('trabajos')
  }, [hash])
  const [ruleOpen, setRuleOpen] = useState(false)
  const [season, setSeason] = useState<ContractVisitRule['season']>('high')
  const [months, setMonths] = useState<number[]>([6, 7, 8, 9])
  const [weekday, setWeekday] = useState('1')
  const [everyNWeeks, setEveryNWeeks] = useState('1')
  const [duration, setDuration] = useState('60')
  const [ruleTitle, setRuleTitle] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [generationMonth, setGenerationMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const operationIds = useRef(new Map<string, string>())
  const documentRef = useRef<ContractDocumentHandle>(null)
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
    Number(duration) <= 720
  const ruleDirty =
    season !== 'high' ||
    months.length !== 4 ||
    [6, 7, 8, 9].some((month) => !months.includes(month)) ||
    weekday !== '1' ||
    everyNWeeks !== '1' ||
    duration !== '60' ||
    Boolean(ruleTitle)

  function resetRule() {
    setSeason('high')
    setMonths([6, 7, 8, 9])
    setWeekday('1')
    setEveryNWeeks('1')
    setDuration('60')
    setRuleTitle('')
  }

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['service-contracts', tenant.id] }),
      queryClient.invalidateQueries({ queryKey: ['contract-jobs', tenant.id] }),
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
      localStart: contract.preferred_start.slice(0, 5),
      durationMinutes: Number(duration),
      title: ruleTitle.trim(),
    }
    const key = `rule:${JSON.stringify(payload)}`
    const operationId = stableOperation(key)
    setBusy('rule')
    try {
      await addContractVisitRule({ ...payload, operationId })
      operationIds.current.delete(key)
      await refresh()
      resetRule()
      setRuleOpen(false)
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

  async function generate() {
    if (busy) return
    setBusy('generate')
    try {
      const first = `${generationMonth}-01`
      const next = new Date(`${first}T12:00:00Z`)
      next.setUTCMonth(next.getUTCMonth() + 1, 0)
      const count = await generateContractVisits(tenant.id, first, next.toISOString().slice(0, 10))
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

  const jobsPanel = (
    <CleaningServicesPanel
      tenantId={tenant.id}
      contractId={contract.id}
      targetJobId={tab === 'trabajos' ? hash : ''}
      clientId={contract.client_id}
      clientName={clients.find((client) => client.id === contract.client_id)?.name ?? 'Cliente'}
      contractLocationId={contract.location_id}
      preferredStart={contract.preferred_start}
      assignedUserIds={contract.assigned_user_ids}
      workTeamId={contract.work_team_id}
      quotedScope={contract.included_scope ?? []}
      startsOn={contract.starts_on}
      endsOn={contract.ends_on}
      updatedAt={contract.updated_at}
      draft={contract.status === 'draft'}
      compact={tab === 'resumen'}
      editable={
        can(session?.role, 'contracts:write') &&
        (contract.status === 'draft' || contract.status === 'active')
      }
    />
  )

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{contract.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {clients.find((client) => client.id === contract.client_id)?.name ?? 'Cliente'}
            {contract.signed_at
              ? ` · Firma registrada el ${new Date(contract.signed_at).toLocaleDateString('es-ES')}`
              : ''}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          <ContractStatusBadge status={contract.status} />
          <Badge variant={contract.signed_at ? 'success' : 'neutral'}>
            {contract.signed_at ? 'Firmado' : 'Pendiente de firma'}
          </Badge>
          <ContractActions contract={contract} />
        </div>
      </header>
      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
        <div className="overflow-x-auto">
          <TabsList aria-label="Secciones del contrato" className="min-w-max">
            <TabsTrigger id="resumen">Resumen</TabsTrigger>
            <TabsTrigger id="trabajos">Trabajos</TabsTrigger>
            <TabsTrigger id="documento">Documento</TabsTrigger>
            {can(session?.role, 'work:costs') ? (
              <TabsTrigger id="finanzas">Facturación</TabsTrigger>
            ) : null}
            <TabsTrigger id="actividad">Planificación e historial</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent
          shouldForceMount
          hidden={tab !== 'resumen'}
          id="resumen"
          className="mt-5 space-y-4"
        >
          <ContractSummary
            contract={contract}
            canEdit={can(session?.role, 'contracts:write')}
            client={clients.find((client) => client.id === contract.client_id)}
            active={tab === 'resumen'}
            onPrint={() => {
              if (documentRef.current) documentRef.current.print()
              else toast.error('El documento todavía se está preparando')
            }}
            onViewDocument={() => setTab('documento')}
          >
            {tab === 'resumen' ? jobsPanel : null}
          </ContractSummary>
        </TabsContent>
        <TabsContent
          shouldForceMount
          hidden={tab !== 'trabajos'}
          id="trabajos"
          className="mt-5 space-y-4"
        >
          {tab === 'trabajos' ? jobsPanel : null}

          {contract.signed_at &&
          session?.tenantId === contract.tenant_id &&
          can(session?.role, 'contracts:write') ? (
            <ContractAssignmentsPanel tenantId={contract.tenant_id} contractId={contract.id} />
          ) : null}
        </TabsContent>
        <TabsContent shouldForceMount hidden={tab !== 'documento'} id="documento" className="mt-5">
          <ContractDocument
            ref={documentRef}
            contract={contract}
            tenant={tenant}
            client={clients.find((client) => client.id === contract.client_id)}
            canEdit={
              session?.tenantId === contract.tenant_id && can(session?.role, 'contracts:write')
            }
          />
        </TabsContent>

        {can(session?.role, 'work:costs') ? (
          <TabsContent id="finanzas" className="mt-5 space-y-4">
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
          </TabsContent>
        ) : null}

        <TabsContent id="actividad" className="mt-5 space-y-4">
          {query.data.rules.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Pautas por temporada anteriores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {query.data.rules.length ? (
                  <ul className="space-y-2 text-sm">
                    {query.data.rules.map((rule) => (
                      <li key={rule.id} className="rounded-lg border p-3">
                        <p className="font-medium">
                          {rule.title} ·{' '}
                          {rule.season === 'high' ? 'Temporada alta' : 'Temporada baja'}
                        </p>
                        <p className="text-muted-foreground">
                          {describeRule(rule, contract.preferred_start)} · meses{' '}
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
                  <>
                    <Button variant="outline" onPress={() => setRuleOpen(true)}>
                      Añadir frecuencia
                    </Button>
                    <FormDialog
                      open={ruleOpen}
                      onOpenChange={(open) => {
                        setRuleOpen(open)
                        if (!open) resetRule()
                      }}
                      title="Añadir frecuencia"
                      submitLabel={busy === 'rule' ? 'Guardando…' : 'Añadir frecuencia'}
                      submitDisabled={Boolean(busy) || !validRule}
                      isSubmitting={busy === 'rule'}
                      isDirty={ruleDirty}
                      onSubmit={() => void addRule()}
                    >
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
                        placeholder="Limpieza del centro"
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
                        label="Duración, minutos"
                        type="number"
                        value={duration}
                        onChange={setDuration}
                        placeholder="60"
                        min={15}
                        max={720}
                      />
                      <fieldset className="sm:col-span-2">
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
                    </FormDialog>
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {contract.status === 'active' && can(session?.role, 'contracts:write') ? (
            <Card>
              <CardHeader>
                <CardTitle>Generación de trabajos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <TextField
                  label="Mes que se va a preparar (todos los contratos activos)"
                  type="month"
                  value={generationMonth}
                  onChange={setGenerationMonth}
                  placeholder="Mes"
                />
                <Link
                  to="/trabajos"
                  search={{ view: 'calendar', period: 'month', date: `${generationMonth}-01` }}
                  className="text-primary text-sm underline"
                >
                  Revisar visitas del mes
                </Link>
                <Button
                  variant="outline"
                  isDisabled={Boolean(busy) || !/^\d{4}-\d{2}$/.test(generationMonth)}
                  onPress={() => void generate()}
                >
                  Preparar mes
                </Button>
                <p className="text-muted-foreground text-xs">
                  Al activar se generan todos los trabajos de este contrato entre las fechas de
                  inicio y fin, con el equipo elegido. Los conflictos se muestran para revisión.
                  Repetir no duplica ni devuelve una visita reprogramada a su fecha original.
                  «Preparar mes» solo recupera fechas pendientes para todos los contratos activos.
                  Las hojas fijas no emiten visitas.
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
                        {visit.work_team_id
                          ? ' · Equipo asignado'
                          : visit.assigned_user_id
                            ? ''
                            : ' · Pendiente de asignar'}
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
                    {event.kind === 'signed'
                      ? 'Firma registrada por administración'
                      : event.kind === 'signed_document_attached'
                        ? 'PDF firmado adjuntado'
                        : event.kind === 'created'
                          ? 'Creado'
                          : event.kind === 'rule_added'
                            ? 'Trabajo añadido'
                            : event.kind === 'service_updated'
                              ? 'Trabajo configurado'
                              : event.kind === 'details_updated'
                                ? 'Datos del contrato actualizados'
                                : 'Estado cambiado'}
                    {typeof event.payload.reason === 'string' && event.payload.reason
                      ? ` · ${event.payload.reason}`
                      : ''}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
