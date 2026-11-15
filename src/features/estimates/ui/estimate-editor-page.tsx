import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  PageHeader,
  PageHeaderActions,
  PageHeaderHeading,
  PageHeaderTitle,
  toast,
} from '@doscientos/ui'
import { Copy, DotsThree, Eye, Files, Trash, WhatsappLogo } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import { ClientFormDialog } from '@/features/clients/ui/client-form-dialog'
import {
  RelatedCreateButton,
  useRelatedRecordCreation,
} from '@/features/clients/ui/related-record-creation'
import {
  convertAcceptedEstimateToContract,
  findContractForEstimate,
} from '@/features/contracts/application/contract-actions'
import { listTechnicians } from '@/features/visits/application/visit-actions'
import { convertAcceptedEstimate, findWorkOrderForEstimate } from '@/features/work-orders'
import { loadWorkTargetOptions } from '@/features/work-orders/application/work-order-actions'
import {
  estimateTotals,
  milestoneAmounts,
  milestonePercentSum,
  paidForEstimate,
} from '@/shared/domain/estimate'
import { formLimits } from '@/shared/domain/form-limits'
import type { Estimate } from '@/shared/domain/types'
import { sendDocument } from '@/shared/lib/send-document'
import { whatsappLink } from '@/shared/lib/whatsapp'
import { getSaveStatus, refreshStore, useTenantData } from '@/shared/store/store'
import { DocumentPreview } from '@/shared/ui/document-preview'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField, TextareaField } from '@/shared/ui/form'
import { PageNotFound } from '@/shared/ui/page-states'
import { StatusBadge } from '@/shared/ui/status-badge'

import { deleteEstimate, duplicateEstimate } from '../application/estimate-actions'
import {
  loadManualEstimateAcceptance,
  loadPublishedEstimate,
  publishEstimate,
} from '../application/estimate-publication-actions'
import { recordManualApproval } from '../application/record-manual-approval'
import { requiredEstimateSectionsError } from '../domain/estimate-sections'
import { EstimateAutoSaveStatus } from './estimate-auto-save-status'
import { EstimateDocument } from './estimate-document'
import { useEstimateDraft, usePatchEstimate } from './estimate-draft-context'
import { EstimatePricingEditor } from './estimate-pricing-editor'
import { EstimateSectionsEditor } from './estimate-sections-editor'
import { MilestonesEditor } from './milestones-editor'
import { ServiceProposalAssistant } from './service-proposal-assistant'
import { useEstimatePrint } from './use-estimate-print'

export function EstimateEditorPage({ estimateId }: { estimateId: string }) {
  const creation = useEstimateDraft()
  const patchEstimate = usePatchEstimate()
  const { estimates, clients, catalog, tenant, ledger } = useTenantData()
  const navigate = useNavigate()
  const session = useSession()
  const [preview, setPreview] = useState(false)
  const { documentRef, print } = useEstimatePrint()
  const [creatingClient, setCreatingClient] = useState(false)
  const [converting, setConverting] = useState(false)
  const conversionOperationId = useRef(crypto.randomUUID())
  const [contractLocationId, setContractLocationId] = useState('')
  const [contractStart, setContractStart] = useState(() => new Date().toISOString().slice(0, 10))
  const [contractEnd, setContractEnd] = useState('')
  const [contractTechnicianId, setContractTechnicianId] = useState('')
  const [acceptingManually, setAcceptingManually] = useState(false)
  const manualAcceptanceInFlight = useRef(false)
  const manualOperationId = useRef(crypto.randomUUID())
  const estimate = creation?.estimate ?? estimates.find((e) => e.id === estimateId)
  const [titleEdit, setTitleEdit] = useState<{ estimateId: string; value: string } | null>(null)
  const publication = useQuery({
    queryKey: ['estimate-publication', tenant.id, estimateId],
    queryFn: () => loadPublishedEstimate(tenant.id, estimateId),
    enabled: Boolean(estimate && estimate.status !== 'draft'),
  })
  const existingWork = useQuery({
    queryKey: ['estimate-work', tenant.id, estimateId],
    queryFn: () => findWorkOrderForEstimate(tenant.id, estimateId),
    enabled: estimate?.status === 'accepted',
  })
  const existingContract = useQuery({
    queryKey: ['estimate-contract', tenant.id, estimateId],
    queryFn: () => findContractForEstimate(tenant.id, estimateId),
    enabled: estimate?.status === 'accepted',
  })
  const contractTargets = useQuery({
    queryKey: ['work-target-options', tenant.id, estimate?.clientId],
    queryFn: () => loadWorkTargetOptions(tenant.id, estimate?.clientId ?? ''),
    enabled: estimate?.status === 'accepted' && estimate.conversionDestination === 'contract',
  })
  const contractTechnicians = useQuery({
    queryKey: ['technicians', tenant.id],
    queryFn: () => listTechnicians(tenant.id),
    enabled: estimate?.status === 'accepted' && estimate.conversionDestination === 'contract',
  })
  const manualAcceptance = useQuery({
    queryKey: ['estimate-manual-acceptance', tenant.id, estimateId],
    queryFn: () => loadManualEstimateAcceptance(tenant.id, estimateId),
    enabled: estimate?.status === 'accepted' && can(session?.role, 'estimates:write'),
  })
  const related = useRelatedRecordCreation({
    tenantId: tenant.id,
    clientId: estimate?.clientId ?? '',
    onLocationCreated: setContractLocationId,
  })

  if (!estimate) {
    return (
      <PageNotFound
        title="Este presupuesto ya no existe"
        description="Puede que lo hayas borrado. Vuelve a la lista para ver los que tienes."
        backTo="/presupuestos"
        backLabel="Ver mis presupuestos"
      />
    )
  }

  const client = clients.find((c) => c.id === estimate.clientId)
  const titleDraft = titleEdit?.estimateId === estimate.id ? titleEdit.value : estimate.title
  const totals = estimateTotals(estimate)
  const amounts = milestoneAmounts(estimate.milestones, totals.totalCents)
  const percentSum = milestonePercentSum(estimate.milestones)
  const paid = paidForEstimate(estimate.id, ledger)

  async function copyPublicLink() {
    try {
      const published = await publishEstimate(tenant.id, estimateId)
      const link = `${window.location.origin}/p/${published.token}`
      await refreshStore()
      try {
        await navigator.clipboard.writeText(link)
        toast.success('Enlace copiado', {
          description: 'El cliente puede verlo y aceptarlo desde ahí.',
        })
      } catch {
        toast.error('Publicado, pero no se pudo copiar el enlace', { description: link })
      }
    } catch (error) {
      toast.error('No se pudo publicar el presupuesto', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    }
  }

  async function sendByEmail() {
    if (!estimate) return
    const sectionsError =
      estimate.status === 'draft' ? requiredEstimateSectionsError(estimate) : null
    if (sectionsError) {
      toast.error('No se puede enviar el presupuesto', { description: sectionsError })
      return
    }
    if (getSaveStatus().state !== 'saved') {
      toast.error('Espera a que termine el guardado antes de enviar.')
      return
    }
    if (!client?.email) {
      toast.error('No se envió', {
        description: 'El cliente no tiene email. Añádelo en Clientes y vuelve a enviar.',
      })
      return
    }
    await sendDocument('estimate', estimate.id)
    await refreshStore()
  }

  async function sendByWhatsapp() {
    if (!estimate) return
    let popup: Window | null = null
    try {
      if (getSaveStatus().state !== 'saved') {
        throw new Error('Espera a que termine el guardado antes de enviar.')
      }
      popup = window.open('', '_blank')
      const published = await publishEstimate(tenant.id, estimate.id)
      const link = `${window.location.origin}/p/${published.token}`
      const message = [
        `Hola ${published.snapshot.client.name},`,
        `Te compartimos el presupuesto ${published.snapshot.estimate.number} para «${published.snapshot.estimate.title}».`,
        `Puedes verlo y responder aquí: ${link}`,
        published.snapshot.tenant.name,
      ].join('\n\n')
      const url = whatsappLink(client?.phone ?? '', message)
      if (popup) popup.location.replace(url)
      else window.location.assign(url)
      await refreshStore()
    } catch (error) {
      popup?.close()
      toast.error('No se pudo publicar el presupuesto', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    }
  }

  async function convertToWork() {
    if (converting) return
    setConverting(true)
    try {
      const workOrderId = await convertAcceptedEstimate(
        tenant.id,
        estimateId,
        conversionOperationId.current,
      )
      toast.success('Trabajo creado desde el presupuesto aceptado')
      void navigate({ to: '/trabajos/$workOrderId', params: { workOrderId } })
    } catch (error) {
      toast.error('No se pudo crear el trabajo', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await existingWork.refetch()
    } finally {
      setConverting(false)
    }
  }

  async function convertToContract() {
    if (
      converting ||
      related.pending ||
      !contractTargets.data?.locations.some((location) => location.id === contractLocationId) ||
      !contractStart ||
      (contractEnd && contractEnd < contractStart)
    )
      return
    setConverting(true)
    try {
      const contractId = await convertAcceptedEstimateToContract({
        tenantId: tenant.id,
        estimateId,
        locationId: contractLocationId,
        startsOn: contractStart,
        endsOn: contractEnd || null,
        defaultAssignedUserId: contractTechnicianId || null,
        operationId: conversionOperationId.current,
      })
      toast.success('Contrato creado desde el presupuesto aceptado')
      void navigate({ to: '/contratos/$contractId', params: { contractId } })
    } catch (error) {
      toast.error('No se pudo crear el contrato', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
      await existingContract.refetch()
    } finally {
      setConverting(false)
    }
  }

  async function recordManualAcceptance() {
    if (
      !estimate ||
      creation ||
      manualAcceptanceInFlight.current ||
      !can(session?.role, 'estimates:write')
    )
      return
    manualAcceptanceInFlight.current = true
    setAcceptingManually(true)
    let published = false
    try {
      await recordManualApproval({
        status: estimate.status,
        tenantId: tenant.id,
        estimateId,
        operationId: manualOperationId.current,
        onPublished: () => {
          published = true
        },
      })
      toast.success('Presupuesto aprobado')
      await refreshStore()
    } catch (error) {
      toast.error('No se pudo aprobar el presupuesto', {
        description: `${published ? 'El presupuesto quedó publicado. ' : estimate.status === 'draft' ? 'Comprueba si el presupuesto quedó publicado. ' : ''}${error instanceof Error ? error.message : 'Inténtalo de nuevo.'}`,
      })
      await refreshStore()
    } finally {
      manualAcceptanceInFlight.current = false
      setAcceptingManually(false)
    }
  }

  if (preview) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" onPress={() => setPreview(false)}>
            Volver a editar
          </Button>
          <Button onPress={print}>Imprimir o guardar PDF</Button>
        </div>
        <DocumentPreview label="del presupuesto">
          <EstimateDocument
            estimate={estimate}
            client={client}
            tenant={tenant}
            documentRef={documentRef}
          />
        </DocumentPreview>
      </div>
    )
  }

  if (estimate.status !== 'draft') {
    if (!publication.data) {
      return (
        <div className="space-y-3" aria-live="polite">
          <p>
            {publication.isError
              ? `No se pudo cargar la versión publicada: ${publication.error.message}`
              : 'Cargando versión publicada…'}
          </p>
          {publication.isError ? (
            <Button variant="outline" onPress={() => void publication.refetch()}>
              Reintentar
            </Button>
          ) : null}
        </div>
      )
    }
    const publishedTotals = estimateTotals(publication.data.estimate)
    const publishedAmounts = milestoneAmounts(
      publication.data.estimate.milestones,
      publishedTotals.totalCents,
    )
    const publishedPercentSum = milestonePercentSum(publication.data.estimate.milestones)
    return (
      <div className="space-y-8">
        <PageHeader>
          <PageHeaderHeading>
            <PageHeaderTitle>
              {estimate.number} <StatusBadge status={estimate.status} />
            </PageHeaderTitle>
          </PageHeaderHeading>
          <PageHeaderActions>
            {estimate.status === 'sent' && can(session?.role, 'estimates:write') ? (
              <Button
                variant="outline"
                isDisabled={acceptingManually}
                onPress={() => void recordManualAcceptance()}
              >
                {acceptingManually ? 'Aprobando…' : 'Marcar como aprobado'}
              </Button>
            ) : null}
            {estimate.status === 'accepted' && existingWork.data ? (
              <Link
                to="/trabajos/$workOrderId"
                params={{ workOrderId: existingWork.data }}
                className={buttonVariants()}
              >
                Abrir trabajo
              </Link>
            ) : null}
            {estimate.status === 'accepted' &&
            publication.data.estimate.conversionDestination !== 'contract' &&
            !existingWork.data &&
            can(session?.role, 'work:write') ? (
              <Button
                isDisabled={converting || existingWork.isPending}
                onPress={() => void convertToWork()}
              >
                {converting ? 'Creando trabajo…' : 'Crear trabajo'}
              </Button>
            ) : null}
            {estimate.status === 'accepted' && existingContract.data ? (
              <Link
                to="/contratos/$contractId"
                params={{ contractId: existingContract.data }}
                className={buttonVariants()}
              >
                Abrir contrato
              </Link>
            ) : null}
            <Button variant="outline" onPress={() => void sendByEmail()}>
              Enviar por email
            </Button>
            <Button variant="outline" onPress={print}>
              Imprimir o guardar PDF
            </Button>
            <DropdownMenuTrigger>
              <IconButton variant="outline" size="icon-lg" label="Más opciones del presupuesto">
                <DotsThree aria-hidden="true" weight="bold" className="size-4" />
              </IconButton>
              <DropdownMenuContent placement="bottom end">
                <DropdownMenuItem onAction={() => void sendByWhatsapp()}>
                  <WhatsappLogo aria-hidden="true" className="size-4" />
                  Enviar por WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem onAction={() => void copyPublicLink()}>
                  <Copy aria-hidden="true" className="size-4" />
                  Copiar enlace del cliente
                </DropdownMenuItem>
                <DropdownMenuItem
                  onAction={() => {
                    const id = duplicateEstimate(estimate.id)
                    if (id)
                      void navigate({
                        to: '/presupuestos/$estimateId',
                        params: { estimateId: id },
                      })
                  }}
                >
                  <Files aria-hidden="true" className="size-4" />
                  Crear revisión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuTrigger>
          </PageHeaderActions>
        </PageHeader>
        {(estimate.status === 'accepted' && manualAcceptance.data) || estimate.emailSentAt ? (
          <details className="text-muted-foreground text-sm">
            <summary className="cursor-pointer font-medium">Detalles de aprobación y envío</summary>
            {estimate.status === 'accepted' && manualAcceptance.data ? (
              <p className="mt-2">
                Aprobado en oficina el{' '}
                {new Date(manualAcceptance.data.accepted_at).toLocaleString('es-ES')}
                {' · '}
                {manualAcceptance.data.accepted_by}. {manualAcceptance.data.evidence_description}
              </p>
            ) : null}
            {estimate.emailSentAt ? (
              <p className="mt-2">
                Último envío confirmado: {new Date(estimate.emailSentAt).toLocaleString('es-ES')}
              </p>
            ) : null}
          </details>
        ) : null}
        {estimate.status === 'accepted' &&
        !publication.data.estimate.automaticContract &&
        publication.data.estimate.conversionDestination === 'contract' &&
        !existingContract.data &&
        can(session?.role, 'contracts:write') ? (
          <Card>
            <CardHeader>
              <CardTitle>Crear contrato desde la versión aceptada</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm">
                El alcance, la periodicidad y la base imponible por periodo se copian de la versión
                que aceptó el cliente. Elige dónde y cuándo comenzará el servicio.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <SelectField
                    label="Centro"
                    value={contractLocationId}
                    options={[
                      { value: '', label: 'Selecciona un centro' },
                      ...(contractTargets.data?.locations ?? []).map((location) => ({
                        value: location.id,
                        label: location.name,
                      })),
                    ]}
                    onChange={setContractLocationId}
                  />
                  {related.allowed ? (
                    <RelatedCreateButton
                      label="Crear centro"
                      disabled={converting || related.pending || !estimate.clientId}
                      onPress={() => related.start('location')}
                    />
                  ) : null}
                </div>
                <TextField
                  label="Inicio"
                  type="date"
                  value={contractStart}
                  onChange={setContractStart}
                  placeholder="Fecha de inicio"
                />
                <TextField
                  label="Fin, si está pactado"
                  type="date"
                  value={contractEnd}
                  onChange={setContractEnd}
                  placeholder="Sin fecha de fin"
                />
                <SelectField
                  label="Técnico habitual"
                  value={contractTechnicianId}
                  options={[
                    { value: '', label: 'Sin asignar' },
                    ...(contractTechnicians.data ?? []).map((technician) => ({
                      value: technician.id,
                      label: technician.label,
                    })),
                  ]}
                  onChange={setContractTechnicianId}
                />
              </div>
              {contractTargets.isError ? (
                <p role="alert">
                  No se pudieron cargar los centros.{' '}
                  <Button variant="outline" onPress={() => void contractTargets.refetch()}>
                    Reintentar
                  </Button>
                </p>
              ) : null}
              {related.status}
              <Button
                isDisabled={
                  converting ||
                  existingContract.isPending ||
                  related.pending ||
                  !contractTargets.data?.locations.some(
                    (location) => location.id === contractLocationId,
                  ) ||
                  !contractStart ||
                  Boolean(contractEnd && contractEnd < contractStart)
                }
                onPress={() => void convertToContract()}
              >
                {converting ? 'Creando contrato…' : 'Crear contrato en borrador'}
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {estimate.status === 'accepted' &&
        publication.data.estimate.automaticContract &&
        !existingContract.data ? (
          <div className="rounded-lg border p-4" aria-live="polite">
            <p>
              {existingContract.isPending
                ? 'Cargando el contrato creado al aceptar…'
                : 'No se pudo recuperar el contrato. Recarga para consultar el resultado; no vuelvas a aceptar el presupuesto.'}
            </p>
            <Button variant="outline" onPress={() => void existingContract.refetch()}>
              Recargar contrato
            </Button>
          </div>
        ) : null}
        {publication.data.source === 'migration' ? (
          <p className="border-warning/40 bg-warning/5 rounded-lg border p-3 text-sm">
            Esta copia se reconstruyó durante la migración con los datos disponibles entonces; no
            acredita el contenido exacto del envío original.
          </p>
        ) : null}
        <DocumentPreview label="del presupuesto">
          <EstimateDocument
            estimate={publication.data.estimate}
            client={publication.data.client}
            tenant={publication.data.tenant}
            documentRef={documentRef}
          />
        </DocumentPreview>
        {publication.data.estimate.conversionDestination !== 'contract' ? (
          <Card>
            <CardHeader>
              <CardTitle>Hitos de pago</CardTitle>
            </CardHeader>
            <CardContent>
              <MilestonesEditor
                estimate={publication.data.estimate}
                amounts={publishedAmounts}
                percentSum={publishedPercentSum}
                paidCents={paid}
                totalCents={publishedTotals.totalCents}
                ledger={ledger}
                readOnly
              />
            </CardContent>
          </Card>
        ) : null}
        {related.dialogs}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>
            {creation ? (
              'Nuevo presupuesto'
            ) : (
              <>
                {estimate.number} <StatusBadge status={estimate.status} />
              </>
            )}
          </PageHeaderTitle>
        </PageHeaderHeading>
        <PageHeaderActions>
          {!creation && can(session?.role, 'estimates:write') ? (
            <Button
              variant="outline"
              isDisabled={acceptingManually}
              onPress={() => void recordManualAcceptance()}
            >
              {acceptingManually ? 'Aprobando…' : 'Marcar como aprobado'}
            </Button>
          ) : null}
          {!creation ? (
            <Button onPress={() => void sendByEmail()}>
              <span className="inline-flex items-center gap-2">
                {fieldIcons.mail}
                Enviar por email
              </span>
            </Button>
          ) : null}
          <Button variant="outline" onPress={() => setPreview(true)}>
            <span className="inline-flex items-center gap-2">
              <Eye aria-hidden="true" className="size-4" />
              Vista del cliente
            </span>
          </Button>
          {!creation ? (
            <DropdownMenuTrigger>
              <IconButton variant="outline" label="Más opciones del presupuesto">
                <DotsThree aria-hidden="true" weight="bold" className="size-4" />
              </IconButton>
              <DropdownMenuContent placement="bottom end">
                <DropdownMenuItem onAction={() => void sendByWhatsapp()}>
                  <WhatsappLogo aria-hidden="true" className="size-4" />
                  Enviar por WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem onAction={() => void copyPublicLink()}>
                  <Copy aria-hidden="true" className="size-4" />
                  Copiar enlace del cliente
                </DropdownMenuItem>
                <DropdownMenuItem
                  onAction={() => {
                    const id = duplicateEstimate(estimate.id)
                    if (id)
                      void navigate({
                        to: '/presupuestos/$estimateId',
                        params: { estimateId: id },
                      })
                  }}
                >
                  <Files aria-hidden="true" className="size-4" />
                  Duplicar presupuesto
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onAction={() => {
                    deleteEstimate(estimate.id)
                    void navigate({ to: '/presupuestos' })
                  }}
                >
                  <Trash aria-hidden="true" className="size-4" />
                  Eliminar presupuesto
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuTrigger>
          ) : null}
        </PageHeaderActions>
      </PageHeader>

      <fieldset disabled={creation?.submitted} className="min-w-0 space-y-5">
        <Card className="@container">
          <CardHeader>
            <CardTitle>Datos generales</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 @min-[44rem]:grid-cols-4">
            <TextField
              label="Título del servicio o acuerdo"
              minLength={1}
              maxLength={formLimits.estimateTitle}
              required
              showCount
              className="sm:col-span-2"
              placeholder="Ej. Limpieza de oficinas"
              icon={fieldIcons.file}
              value={titleDraft}
              onChange={(value) =>
                creation
                  ? patchEstimate(estimate.id, { title: value })
                  : setTitleEdit({ estimateId: estimate.id, value })
              }
              onBlur={() => {
                if (creation) return
                const title = titleDraft.trim()
                setTitleEdit(null)
                if (title.length >= 1 && title.length <= formLimits.estimateTitle) {
                  patchEstimate(estimate.id, { title })
                }
              }}
            />
            <div className="flex min-w-0 flex-col gap-1.5 @min-[44rem]:col-span-2">
              <SelectField
                label="Cliente"
                value={estimate.clientId}
                options={[
                  { value: '', label: 'Sin cliente' },
                  ...clients
                    .filter((c) => !c.archivedAt || c.id === estimate.clientId)
                    .map((c) => ({ value: c.id, label: c.name })),
                ]}
                onChange={(clientId) => patchEstimate(estimate.id, { clientId })}
              />
              {can(session?.role, 'clients:write') ? (
                <button
                  type="button"
                  className="text-primary self-start text-xs font-medium hover:underline"
                  onClick={() => setCreatingClient(true)}
                >
                  {clients.length === 0 ? '+ Crear tu primer cliente' : '+ Crear cliente nuevo'}
                </button>
              ) : null}
            </div>
            <TextField
              label="Válido hasta"
              type="date"
              placeholder="dd/mm/aaaa"
              helper="Pasada esta fecha el presupuesto caduca."
              value={estimate.validUntil}
              onChange={(validUntil) => patchEstimate(estimate.id, { validUntil })}
            />
            {!estimate.automaticContract ? (
              <SelectField
                label="Destino tras la aceptación"
                className={
                  estimate.conversionDestination === 'contract' ? '' : '@min-[44rem]:col-span-2'
                }
                value={estimate.conversionDestination ?? 'work'}
                options={[
                  { value: 'work', label: 'Trabajo' },
                  { value: 'contract', label: 'Contrato recurrente' },
                ]}
                onChange={(value) =>
                  patchEstimate(estimate.id, {
                    conversionDestination: value as NonNullable<Estimate['conversionDestination']>,
                  })
                }
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Al aceptarse se crea automáticamente el contrato en borrador, con cada partida como
                trabajo pendiente de configurar.
              </p>
            )}
          </CardContent>
        </Card>

        {estimate.documentFormat === 'sections' ? (
          <EstimateSectionsEditor estimate={estimate} />
        ) : (
          <Card className="@container">
            <CardHeader>
              <CardTitle>Partidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <EstimatePricingEditor estimate={estimate} catalog={catalog} />
            </CardContent>
          </Card>
        )}

        {estimate.conversionDestination !== 'contract' ? (
          <Card>
            <CardHeader>
              <CardTitle>Hitos de pago</CardTitle>
            </CardHeader>
            <CardContent>
              <MilestonesEditor
                estimate={estimate}
                amounts={amounts}
                percentSum={percentSum}
                paidCents={paid}
                totalCents={totals.totalCents}
                ledger={ledger}
              />
            </CardContent>
          </Card>
        ) : null}

        {estimate.documentFormat !== 'sections' ? (
          <Card>
            <CardHeader>
              <CardTitle>Descripción y condiciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ServiceProposalAssistant
                clauses={estimate.clauses}
                onChange={(clauses) => patchEstimate(estimate.id, { clauses })}
              />
              <TextareaField
                label="Condiciones"
                hideLabel
                placeholder="Forma de pago, plazos, garantía, qué incluye y qué no…"
                value={estimate.clauses}
                maxLength={formLimits.estimateClauses}
                helper={`Máximo ${formLimits.estimateClauses} caracteres.`}
                onChange={(clauses) => patchEstimate(estimate.id, { clauses })}
              />
            </CardContent>
          </Card>
        ) : null}
      </fieldset>

      {creation ? (
        <div className="space-y-3 border-t pt-4">
          <p className="text-muted-foreground text-sm">
            {creation.submitted
              ? 'La creación está pendiente de confirmación. Reintenta sin duplicar el presupuesto.'
              : 'El presupuesto no se guardará hasta que pulses «Crear presupuesto».'}
          </p>
          {creation.error ? (
            <p role="alert" className="text-destructive text-sm">
              {creation.error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-3">
            <Link to="/presupuestos" className="text-sm underline">
              Cancelar
            </Link>
            <Button type="submit" isDisabled={creation.busy}>
              {creation.busy
                ? 'Creando presupuesto…'
                : creation.submitted
                  ? 'Reintentar creación'
                  : 'Crear presupuesto'}
            </Button>
          </div>
        </div>
      ) : (
        <EstimateAutoSaveStatus />
      )}

      <ClientFormDialog
        open={creatingClient}
        onClose={() => setCreatingClient(false)}
        onSaved={(clientId) => patchEstimate(estimate.id, { clientId })}
      />
    </div>
  )
}
