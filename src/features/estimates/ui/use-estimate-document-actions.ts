import { toast } from '@doscientos/ui'
import { useRef, useState } from 'react'

import { paymentMilestonesError } from '@/shared/domain/estimate'
import type { Client, Estimate } from '@/shared/domain/types'
import { sendDocument } from '@/shared/lib/send-document'
import { whatsappLink } from '@/shared/lib/whatsapp'
import { getSaveStatus, refreshStore } from '@/shared/store/store'

import { publishEstimate } from '../application/estimate-publication-actions'
import { recordManualApproval } from '../application/record-manual-approval'
import { requiredEstimateSectionsError } from '../domain/estimate-sections'

export function useEstimateDocumentActions({
  estimate,
  client,
  tenantId,
  canApprove,
}: {
  estimate: Estimate
  client: Client | undefined
  tenantId: string
  canApprove: boolean
}) {
  const [acceptingManually, setAcceptingManually] = useState(false)
  const manualAcceptanceInFlight = useRef(false)
  const manualOperationId = useRef<string | null>(null)

  async function publishWithLink() {
    const paymentError = estimate.status === 'draft' ? paymentMilestonesError(estimate) : null
    if (paymentError) throw new Error(paymentError)
    const published = await publishEstimate(tenantId, estimate.id)
    return { link: `${window.location.origin}/p/${published.token}`, snapshot: published.snapshot }
  }

  async function copyPublicLink() {
    try {
      const { link } = await publishWithLink()
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
      showPublicationError(error)
    }
  }

  async function sendByEmail() {
    const paymentError = estimate.status === 'draft' ? paymentMilestonesError(estimate) : null
    if (paymentError) {
      toast.error('No se puede enviar el presupuesto', { description: paymentError })
      return
    }
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
    let popup: Window | null = null
    try {
      if (getSaveStatus().state !== 'saved') {
        throw new Error('Espera a que termine el guardado antes de enviar.')
      }
      popup = window.open('', '_blank')
      const { link, snapshot } = await publishWithLink()
      const message = [
        `Hola ${snapshot.client.name},`,
        `Te compartimos el presupuesto ${snapshot.estimate.number} para «${snapshot.estimate.title}».`,
        `Puedes verlo y responder aquí: ${link}`,
        snapshot.tenant.name,
      ].join('\n\n')
      const url = whatsappLink(client?.phone ?? '', message)
      if (popup) popup.location.replace(url)
      else window.location.assign(url)
      await refreshStore()
    } catch (error) {
      popup?.close()
      showPublicationError(error)
    }
  }

  async function approve() {
    if (!canApprove || manualAcceptanceInFlight.current) return
    const paymentError = estimate.status === 'draft' ? paymentMilestonesError(estimate) : null
    if (paymentError) {
      toast.error('No se pudo aprobar el presupuesto', { description: paymentError })
      return
    }
    manualAcceptanceInFlight.current = true
    setAcceptingManually(true)
    manualOperationId.current ??= crypto.randomUUID()
    let published = false
    try {
      await recordManualApproval({
        status: estimate.status,
        tenantId,
        estimateId: estimate.id,
        operationId: manualOperationId.current,
        onPublished: () => {
          published = true
        },
      })
      toast.success('Presupuesto aprobado')
      await refreshStore()
    } catch (error) {
      const context = published
        ? 'El presupuesto quedó publicado. '
        : estimate.status === 'draft'
          ? 'Comprueba si el presupuesto quedó publicado. '
          : ''
      toast.error('No se pudo aprobar el presupuesto', {
        description: context + errorMessage(error),
      })
      await refreshStore()
    } finally {
      manualAcceptanceInFlight.current = false
      setAcceptingManually(false)
    }
  }

  return { copyPublicLink, sendByEmail, sendByWhatsapp, approve, acceptingManually }
}

export type EstimateDocumentActions = ReturnType<typeof useEstimateDocumentActions>

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Inténtalo de nuevo.'
}

function showPublicationError(error: unknown) {
  toast.error('No se pudo publicar el presupuesto', { description: errorMessage(error) })
}
