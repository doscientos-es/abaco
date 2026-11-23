import {
  Button,
  buttonVariants,
  PageHeader,
  PageHeaderActions,
  PageHeaderHeading,
  PageHeaderTitle,
  toast,
} from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState, type ReactNode } from 'react'

import { can, useSession } from '@/features/auth'
import { MaterialShortages } from '@/features/catalog'
import { findContractForEstimate } from '@/features/contracts/application/contract-actions'
import { convertAcceptedEstimate, findWorkOrderForEstimate } from '@/features/work-orders'
import type { Estimate, TenantData } from '@/shared/domain/types'
import { StatusBadge } from '@/shared/ui/status-badge'

import {
  loadManualEstimateAcceptance,
  loadPublishedEstimate,
} from '../application/estimate-publication-actions'
import { EstimateContractConversion } from './estimate-contract-conversion'
import { EstimateDesignWorkspace } from './estimate-design-workspace'
import { EstimateOptionsMenu } from './estimate-options-menu'
import { EstimatePaymentMilestones } from './estimate-payment-milestones'
import type { EstimateDocumentActions } from './use-estimate-document-actions'
import { useEstimatePrint } from './use-estimate-print'

export function PublishedEstimatePage({
  estimate,
  tenantId,
  ledger,
  actions,
  approvalButton,
}: {
  estimate: Estimate
  tenantId: string
  ledger: TenantData['ledger']
  actions: Pick<EstimateDocumentActions, 'copyPublicLink' | 'sendByEmail' | 'sendByWhatsapp'>
  approvalButton: ReactNode
}) {
  const estimateId = estimate.id
  const accepted = estimate.status === 'accepted'
  const role = useSession()?.role
  const navigate = useNavigate()
  const { documentRef, print } = useEstimatePrint()
  const [converting, setConverting] = useState(false)
  const conversionOperationId = useRef<string | null>(null)
  const publication = useQuery({
    queryKey: ['estimate-publication', tenantId, estimateId],
    queryFn: () => loadPublishedEstimate(tenantId, estimateId),
  })
  const existingWork = useQuery({
    queryKey: ['estimate-work', tenantId, estimateId],
    queryFn: () => findWorkOrderForEstimate(tenantId, estimateId),
    enabled: accepted,
  })
  const existingContract = useQuery({
    queryKey: ['estimate-contract', tenantId, estimateId],
    queryFn: () => findContractForEstimate(tenantId, estimateId),
    enabled: accepted,
  })
  const manualAcceptance = useQuery({
    queryKey: ['estimate-manual-acceptance', tenantId, estimateId],
    queryFn: () => loadManualEstimateAcceptance(tenantId, estimateId),
    enabled: accepted && can(role, 'estimates:write'),
  })

  async function convertToWork() {
    if (converting) return
    setConverting(true)
    conversionOperationId.current ??= crypto.randomUUID()
    try {
      const workOrderId = await convertAcceptedEstimate(
        tenantId,
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

  const snapshot = publication.data
  if (!snapshot) {
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

  const workId = accepted ? existingWork.data : null
  const contractId = accepted ? existingContract.data : null
  const manualApproval = accepted ? manualAcceptance.data : null
  const { automaticContract, conversionDestination } = snapshot.estimate

  return (
    <div className="space-y-8">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>
            {estimate.number} <StatusBadge status={estimate.status} />
          </PageHeaderTitle>
          <p className="text-muted-foreground text-sm">
            {conversionDestination === 'contract'
              ? 'Mantenimiento · con contrato'
              : 'Instalación · obra puntual'}
          </p>
        </PageHeaderHeading>
        <PageHeaderActions>
          {approvalButton}
          {workId ? (
            <Link
              to="/trabajos/$workOrderId"
              params={{ workOrderId: workId }}
              className={buttonVariants()}
            >
              Abrir trabajo
            </Link>
          ) : accepted && conversionDestination !== 'contract' && can(role, 'work:write') ? (
            <Button
              isDisabled={converting || existingWork.isPending}
              onPress={() => void convertToWork()}
            >
              {converting ? 'Creando trabajo…' : 'Crear trabajo'}
            </Button>
          ) : null}
          {contractId ? (
            <Link to="/contratos/$contractId" params={{ contractId }} className={buttonVariants()}>
              Abrir contrato
            </Link>
          ) : null}
          <Button variant="outline" onPress={() => void actions.sendByEmail()}>
            Enviar por email
          </Button>
          <Button variant="outline" onPress={print}>
            Imprimir o guardar PDF
          </Button>
          <EstimateOptionsMenu
            estimateId={estimateId}
            draft={false}
            onCopyLink={actions.copyPublicLink}
            onSendWhatsapp={actions.sendByWhatsapp}
          />
        </PageHeaderActions>
      </PageHeader>
      {accepted && can(role, 'catalog:read') ? <MaterialShortages estimateId={estimateId} /> : null}
      {manualApproval || estimate.emailSentAt ? (
        <details className="text-muted-foreground text-sm">
          <summary className="cursor-pointer font-medium">Detalles de aprobación y envío</summary>
          {manualApproval ? (
            <p className="mt-2">
              Aprobado en oficina el {new Date(manualApproval.accepted_at).toLocaleString('es-ES')}
              {' · '}
              {manualApproval.accepted_by}. {manualApproval.evidence_description}
            </p>
          ) : null}
          {estimate.emailSentAt ? (
            <p className="mt-2">
              Último envío confirmado: {new Date(estimate.emailSentAt).toLocaleString('es-ES')}
            </p>
          ) : null}
        </details>
      ) : null}
      {accepted &&
      !automaticContract &&
      conversionDestination === 'contract' &&
      !contractId &&
      can(role, 'contracts:write') ? (
        <EstimateContractConversion
          tenantId={tenantId}
          estimateId={estimateId}
          clientId={estimate.clientId}
          checkingExisting={existingContract.isPending}
          refreshExisting={existingContract.refetch}
        />
      ) : null}
      {accepted && automaticContract && !contractId ? (
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
      {snapshot.source === 'migration' ? (
        <p className="border-warning/40 bg-warning/5 rounded-lg border p-3 text-sm">
          Esta copia se reconstruyó durante la migración con los datos disponibles entonces; no
          acredita el contenido exacto del envío original.
        </p>
      ) : null}
      <EstimateDesignWorkspace
        estimate={snapshot.estimate}
        client={snapshot.client}
        tenant={snapshot.tenant}
        documentRef={documentRef}
      />
      <EstimatePaymentMilestones estimate={snapshot.estimate} ledger={ledger} readOnly />
    </div>
  )
}
