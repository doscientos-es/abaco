import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PageHeaderActions,
  PageHeaderHeading,
  PageHeaderTitle,
} from '@doscientos/ui'
import { CheckCircle, Eye, Sparkle } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { useAiAccess, useAiChat } from '@/features/ai'
import { can, useSession } from '@/features/auth'
import { formLimits } from '@/shared/domain/form-limits'
import type { Estimate, TenantData } from '@/shared/domain/types'
import { useTenantData } from '@/shared/store/store'
import { fieldIcons } from '@/shared/ui/field-icons'
import { TextareaField } from '@/shared/ui/form'
import { PageNotFound } from '@/shared/ui/page-states'
import { StatusBadge } from '@/shared/ui/status-badge'

import { EstimateAutoSaveStatus } from './estimate-auto-save-status'
import { EstimateBlockPicker } from './estimate-block-picker'
import { useEstimateDraft, usePatchEstimate } from './estimate-draft-context'
import { EstimateDraftDetails } from './estimate-draft-details'
import { EstimateDraftPreview } from './estimate-draft-preview'
import { EstimateOptionsMenu } from './estimate-options-menu'
import { EstimatePaymentMilestones } from './estimate-payment-milestones'
import { EstimatePricingEditor } from './estimate-pricing-editor'
import { EstimateSectionsEditor } from './estimate-sections-editor'
import { EstimateTemplateField } from './estimate-template-field'
import { PublishedEstimatePage } from './published-estimate-page'
import { ServiceProposalAssistant } from './service-proposal-assistant'
import { useEstimateDocumentActions } from './use-estimate-document-actions'

export function EstimateEditorPage({ estimateId }: { estimateId: string }) {
  const data = useTenantData()
  const creation = useEstimateDraft()
  const estimate = creation?.estimate ?? data.estimates.find(({ id }) => id === estimateId)
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
  return <EstimateEditor key={estimate.id} estimate={estimate} data={data} />
}

function EstimateEditor({ estimate, data }: { estimate: Estimate; data: TenantData }) {
  const { clients, catalog, tenant, ledger } = data
  const creation = useEstimateDraft()
  const isNewEstimate = Boolean(creation)
  const patchEstimate = usePatchEstimate()
  const session = useSession()
  const chat = useAiChat()
  const setChatEstimate = chat?.setEstimate
  const [preview, setPreview] = useState(false)
  const client = clients.find(({ id }) => id === estimate.clientId)
  const canEdit = can(session?.role, 'estimates:write')
  const aiAccess = useAiAccess(tenant.id, creation && canEdit ? session?.userId : undefined)
  const canApprove =
    !creation && canEdit && (estimate.status === 'draft' || estimate.status === 'sent')
  const actions = useEstimateDocumentActions({ estimate, client, tenantId: tenant.id, canApprove })
  const { copyPublicLink, sendByEmail, sendByWhatsapp, approve, acceptingManually } = actions

  useEffect(() => {
    if (
      !setChatEstimate ||
      !canEdit ||
      estimate.status !== 'draft' ||
      creation?.submitted ||
      creation?.busy
    )
      return
    setChatEstimate({
      estimate,
      apply: (patch) => patchEstimate(estimate.id, patch),
      isNew: isNewEstimate,
    })
    return () => setChatEstimate(null)
  }, [
    setChatEstimate,
    canEdit,
    estimate,
    creation?.submitted,
    creation?.busy,
    isNewEstimate,
    patchEstimate,
  ])

  const approvalButton = canApprove ? (
    <Button
      variant="outline"
      aria-label={acceptingManually ? 'Aprobando presupuesto' : 'Marcar como aprobado'}
      className="max-md:min-h-11 max-md:w-11 max-md:px-0"
      isDisabled={acceptingManually}
      onPress={() => void approve()}
    >
      <CheckCircle aria-hidden="true" className="size-4 shrink-0" />
      <span className="max-md:sr-only">
        {acceptingManually ? 'Aprobando…' : 'Marcar como aprobado'}
      </span>
    </Button>
  ) : null

  if (estimate.status !== 'draft') {
    return (
      <PublishedEstimatePage
        estimate={estimate}
        client={client}
        tenantId={tenant.id}
        ledger={ledger}
        actions={actions}
        approvalButton={approvalButton}
      />
    )
  }

  if (preview) {
    return (
      <EstimateDraftPreview
        estimate={estimate}
        client={client}
        tenant={tenant}
        canEdit={canEdit}
        onBack={() => setPreview(false)}
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader className="max-md:items-start">
        <PageHeaderHeading>
          <PageHeaderTitle>
            {creation ? (
              'Nuevo presupuesto'
            ) : (
              <>
                <span className="max-md:hidden">Presupuesto </span>
                {estimate.number} <StatusBadge status={estimate.status} />
              </>
            )}
          </PageHeaderTitle>
        </PageHeaderHeading>
        <PageHeaderActions>
          {creation && aiAccess.data && !creation.submitted ? (
            <Button
              type="button"
              variant="outline"
              onPress={() => chat?.open('Ayúdame a preparar las partidas de este presupuesto. ')}
            >
              <Sparkle aria-hidden="true" className="size-4" /> Generar con IA
            </Button>
          ) : null}
          {approvalButton}
          {!creation ? (
            <Button
              aria-label="Enviar por email"
              className="max-md:min-h-11 max-md:w-11 max-md:px-0"
              onPress={() => void sendByEmail()}
            >
              {fieldIcons.mail}
              <span className="max-md:sr-only">Enviar por email</span>
            </Button>
          ) : null}
          <Button
            variant="outline"
            aria-label="Diseño y vista previa"
            className="max-md:min-h-11 max-md:w-11 max-md:px-0"
            onPress={() => setPreview(true)}
          >
            <Eye aria-hidden="true" className="size-4" />
            <span className="max-md:sr-only">Diseño y vista previa</span>
          </Button>
          {!creation ? (
            <EstimateOptionsMenu
              estimateId={estimate.id}
              draft
              onCopyLink={copyPublicLink}
              onSendWhatsapp={sendByWhatsapp}
            />
          ) : null}
        </PageHeaderActions>
      </PageHeader>

      <fieldset disabled={creation?.submitted} className="min-w-0 space-y-5">
        <EstimateDraftDetails key={estimate.id} estimate={estimate} clients={clients} />

        <EstimateTemplateField
          tenant={tenant}
          design={estimate.documentDesign}
          onChange={(documentDesign) => patchEstimate(estimate.id, { documentDesign })}
        />

        {estimate.documentFormat === 'sections' ? (
          <>
            <EstimateBlockPicker
              estimate={estimate}
              blocks={tenant.documentLibrary?.blocks ?? []}
            />
            <EstimateSectionsEditor estimate={estimate} catalog={catalog} />
          </>
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

        <EstimatePaymentMilestones estimate={estimate} ledger={ledger} />

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
              <EstimateBlockPicker
                estimate={estimate}
                blocks={tenant.documentLibrary?.blocks ?? []}
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
          <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
            <Link to="/presupuestos" className="text-sm underline">
              Cancelar
            </Link>
            <Button type="submit" className="max-md:w-full" isDisabled={creation.busy}>
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
    </div>
  )
}
