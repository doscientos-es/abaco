import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { loadClosedVisitReport } from '../application/visit-report-actions'
import {
  createReportShareAttempt,
  createVisitReportShare,
  getVisitReportPdfJob,
  listVisitReportEmailDeliveries,
  listVisitReportEmailProviderEvents,
  listVisitReportShares,
  retryFailedVisitReportPdfJob,
  revokeVisitReportShare,
  sendVisitReportEmail,
} from '../application/visit-report-share-actions'
import { latestReportEmailOutcome } from '../domain/visit-report-email-outcome'

type CreateAttempt = { token: string; expiresAt: string; operationId: string }
const deliveryLabels = {
  queued: 'Pendiente',
  sending: 'Enviando',
  retry: 'Pendiente de reintento',
  sent: 'Aceptado por el proveedor',
  failed: 'Fallido',
  uncertain: 'Resultado incierto; revisar antes de reenviar',
} as const
const providerLabels: Record<string, string> = {
  'email.delivery_delayed': 'Entrega retrasada por el proveedor',
  'email.delivered': 'Entregado al servidor del destinatario',
  'email.bounced': 'Rebotado',
  'email.complained': 'Marcado como correo no deseado',
  'email.failed': 'Entrega fallida',
  'email.suppressed': 'Envío suprimido por el proveedor',
}

function deliveryErrorLabel(code: string | null) {
  if (code === 'share_unavailable') return 'El enlace ha caducado o se ha revocado.'
  if (code === 'idempotency_window_elapsed')
    return 'El resultado no se pudo confirmar dentro del plazo seguro de reintento.'
  if (code === 'provider_401' || code === 'provider_403')
    return 'Revisa la configuración del proveedor de correo.'
  if (code === 'provider_422') return 'Revisa la dirección del destinatario.'
  if (code) return 'Se registró un error de entrega; revisa la configuración o inténtalo más tarde.'
  return ''
}

export function VisitReportShares({ tenantId, visitId }: { tenantId: string; visitId: string }) {
  const queryClient = useQueryClient()
  const [sharePage, setSharePage] = useState(0)
  const [deliveryPage, setDeliveryPage] = useState(0)
  const closedKey = ['closed-visit-report', tenantId, visitId]
  const closed = useQuery({
    queryKey: closedKey,
    queryFn: () => loadClosedVisitReport(tenantId, visitId),
  })
  const reportVersionId = closed.data?.id
  const pdfJob = useQuery({
    queryKey: ['visit-report-pdf-job', tenantId, reportVersionId],
    enabled: Boolean(reportVersionId),
    refetchInterval: 60_000,
    queryFn: () => {
      if (!reportVersionId) throw new Error('Parte cerrado no disponible')
      return getVisitReportPdfJob(tenantId, reportVersionId)
    },
  })
  const sharesKey = ['visit-report-shares', tenantId, reportVersionId, sharePage]
  const shares = useQuery({
    queryKey: sharesKey,
    enabled: Boolean(reportVersionId),
    refetchInterval: 60_000,
    queryFn: () => {
      if (!reportVersionId) throw new Error('Parte cerrado no disponible')
      return listVisitReportShares(tenantId, reportVersionId, sharePage)
    },
  })
  const deliveryKey = ['visit-report-email-deliveries', tenantId, reportVersionId, deliveryPage]
  const deliveries = useQuery({
    queryKey: deliveryKey,
    enabled: Boolean(reportVersionId),
    refetchInterval: 60_000,
    queryFn: () => {
      if (!reportVersionId) throw new Error('Parte cerrado no disponible')
      return listVisitReportEmailDeliveries(tenantId, reportVersionId, deliveryPage)
    },
  })
  const providerMessageIds =
    deliveries.data?.items
      .map((delivery) => delivery.provider_message_id)
      .filter((id): id is string => Boolean(id)) ?? []
  const providerEvents = useQuery({
    queryKey: ['visit-report-email-provider-events', tenantId, reportVersionId, providerMessageIds],
    enabled: providerMessageIds.length > 0,
    refetchInterval: 60_000,
    queryFn: () => listVisitReportEmailProviderEvents(providerMessageIds),
  })
  const attempt = useRef<CreateAttempt | null>(null)
  const emailAttempt = useRef<string | null>(null)
  const revocations = useRef(new Map<string, string>())
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const [visibleShareId, setVisibleShareId] = useState('')
  const [visibleToken, setVisibleToken] = useState('')
  const [emailQueued, setEmailQueued] = useState(false)

  async function create() {
    if (!reportVersionId || busy) return
    if (!attempt.current) {
      attempt.current = createReportShareAttempt()
    }
    setBusy(true)
    try {
      const shareId = await createVisitReportShare({
        tenantId,
        reportVersionId,
        ...attempt.current,
      })
      setLink(`${window.location.origin}/i/${attempt.current.token}`)
      setVisibleShareId(shareId)
      setVisibleToken(attempt.current.token)
      setEmailQueued(false)
      emailAttempt.current = null
      attempt.current = null
      setSharePage(0)
      await queryClient.invalidateQueries({ queryKey: sharesKey.slice(0, 3) })
      toast.success('Enlace creado. Cópialo antes de salir de esta página.')
    } catch (error) {
      toast.error('No se pudo crear el enlace', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function revoke(shareId: string) {
    if (busy) return
    let operationId = revocations.current.get(shareId)
    if (!operationId) {
      operationId = crypto.randomUUID()
      revocations.current.set(shareId, operationId)
    }
    setBusy(true)
    try {
      await revokeVisitReportShare({ tenantId, shareId, operationId })
      revocations.current.delete(shareId)
      if (visibleShareId === shareId) {
        setLink('')
        setVisibleShareId('')
        setVisibleToken('')
        emailAttempt.current = null
      }
      await queryClient.invalidateQueries({ queryKey: sharesKey.slice(0, 3) })
      toast.success('Enlace revocado')
    } catch (error) {
      toast.error('No se pudo revocar el enlace', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function sendEmail() {
    if (!reportVersionId || !visibleToken || busy || emailQueued) return
    emailAttempt.current ??= crypto.randomUUID()
    setBusy(true)
    try {
      const result = await sendVisitReportEmail({
        tenantId,
        reportVersionId,
        token: visibleToken,
        operationId: emailAttempt.current,
      })
      setEmailQueued(result.status !== 'failed')
      if (result.status === 'failed') emailAttempt.current = null
      setDeliveryPage(0)
      await queryClient.invalidateQueries({ queryKey: deliveryKey.slice(0, 3) })
      if (result.status === 'sent') {
        toast.success(`El proveedor aceptó el correo para ${result.recipientEmail}`)
      } else if (result.status === 'failed' || result.status === 'uncertain') {
        toast.error('La entrega necesita revisión', {
          description: `El intento a ${result.recipientEmail} quedó registrado en el historial.`,
        })
      } else {
        toast.success(`Entrega registrada para ${result.recipientEmail}. Consulta su estado abajo.`)
      }
    } catch (error) {
      toast.error('No se pudo registrar la entrega', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!navigator.clipboard?.writeText) {
      toast.error('Selecciona y copia el enlace manualmente.')
      return
    }
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Enlace copiado')
    } catch {
      toast.error('Selecciona y copia el enlace manualmente.')
    }
  }

  async function retryPdf() {
    if (!reportVersionId || busy) return
    setBusy(true)
    try {
      await retryFailedVisitReportPdfJob(tenantId, reportVersionId)
      await queryClient.invalidateQueries({
        queryKey: ['visit-report-pdf-job', tenantId, reportVersionId],
      })
      toast.success('Generación del PDF pendiente de reintento')
    } catch (error) {
      toast.error('No se pudo reintentar el PDF', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-border space-y-3 border-t pt-4" aria-label="Enlaces del parte">
      <div>
        <h3 className="font-medium">Compartir parte cerrado</h3>
        <p className="text-muted-foreground text-sm">
          El enlace caduca en siete días y se puede revocar. Solo muestra los datos del informe
          destinados al cliente.
        </p>
        {pdfJob.data ? (
          <output className="text-muted-foreground mt-1 block text-xs">
            {pdfJob.data.status === 'ready'
              ? 'PDF conservado y disponible para descarga.'
              : pdfJob.data.status === 'failed'
                ? 'No se pudo generar el PDF. La oficina debe revisar el problema.'
                : 'Preparando el PDF del parte cerrado.'}
          </output>
        ) : null}
        {pdfJob.data?.status === 'failed' ? (
          <Button size="sm" variant="outline" isDisabled={busy} onPress={() => void retryPdf()}>
            Reintentar PDF
          </Button>
        ) : null}
      </div>
      <Button size="sm" isDisabled={!reportVersionId || busy} onPress={() => void create()}>
        Crear enlace seguro
      </Button>
      {link ? (
        <div className="space-y-2">
          <label className="block text-sm">
            Enlace recién creado
            <input
              readOnly
              value={link}
              className="border-input bg-background mt-1 block w-full rounded-lg border px-3 py-2"
              onFocus={(event) => event.target.select()}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onPress={() => void copyLink()}>
              Copiar enlace
            </Button>
            <a
              className="bg-accent text-accent-foreground inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium"
              href={`https://wa.me/?text=${encodeURIComponent(`Te compartimos el parte de visita: ${link}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Compartir por WhatsApp
            </a>
            <Button
              size="sm"
              variant="outline"
              isDisabled={busy || emailQueued}
              onPress={() => void sendEmail()}
            >
              {emailQueued ? 'Correo registrado' : 'Enviar por correo al cliente'}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Por seguridad, este enlace no se puede recuperar después. Puedes crear otro.
          </p>
        </div>
      ) : null}
      {shares.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron consultar los enlaces existentes.
        </p>
      ) : null}
      {shares.data?.items.length ? (
        <ul className="space-y-2">
          {shares.data.items.map((share) => {
            const active = share.active
            return (
              <li
                key={share.id}
                className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm"
              >
                <span className="flex-1">
                  Creado el {new Date(share.created_at).toLocaleDateString('es-ES')} ·{' '}
                  {active
                    ? `Caduca el ${new Date(share.expires_at).toLocaleDateString('es-ES')}`
                    : share.revoked_at
                      ? 'Revocado'
                      : 'Caducado'}
                </span>
                {active ? (
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={busy}
                    onPress={() => void revoke(share.id)}
                  >
                    Revocar
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {sharePage > 0 || shares.data?.hasMore ? (
        <div className="flex items-center gap-2 text-sm" aria-label="Páginas de enlaces">
          <Button
            size="sm"
            variant="outline"
            isDisabled={sharePage === 0}
            onPress={() => setSharePage((page) => page - 1)}
          >
            Anterior
          </Button>
          <span>Página {sharePage + 1}</span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={!shares.data?.hasMore}
            onPress={() => setSharePage((page) => page + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
      {deliveries.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudo consultar el historial de entregas.
        </p>
      ) : null}
      {providerEvents.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudo consultar el resultado final de los correos.
        </p>
      ) : null}
      {deliveries.data?.items.length ? (
        <div className="space-y-2">
          <h4 className="font-medium">Entregas por correo</h4>
          <ul className="space-y-2">
            {deliveries.data.items.map((delivery) => {
              const outcome = latestReportEmailOutcome(
                (providerEvents.data ?? []).filter(
                  (event) =>
                    event.provider_message_id === delivery.provider_message_id &&
                    event.recipient_email.toLowerCase() === delivery.recipient_email.toLowerCase(),
                ),
              )
              return (
                <li key={delivery.id} className="border-border rounded-lg border p-2 text-sm">
                  <span className="font-medium">{delivery.recipient_email}</span> ·{' '}
                  {deliveryLabels[delivery.status]} ·{' '}
                  {new Date(delivery.created_at).toLocaleString('es-ES')}
                  {delivery.attempts > 1 ? ` · ${delivery.attempts} intentos` : ''}
                  {outcome ? (
                    <p className="mt-1 text-xs font-medium">
                      Resultado: {providerLabels[outcome.event_type] ?? outcome.event_type} ·{' '}
                      {new Date(outcome.occurred_at).toLocaleString('es-ES')}
                    </p>
                  ) : null}
                  {delivery.last_error_code ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {deliveryErrorLabel(delivery.last_error_code)}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {deliveryPage > 0 || deliveries.data?.hasMore ? (
        <div className="flex items-center gap-2 text-sm" aria-label="Páginas de entregas">
          <Button
            size="sm"
            variant="outline"
            isDisabled={deliveryPage === 0}
            onPress={() => setDeliveryPage((page) => page - 1)}
          >
            Anterior
          </Button>
          <span>Página {deliveryPage + 1}</span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={!deliveries.data?.hasMore}
            onPress={() => setDeliveryPage((page) => page + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </section>
  )
}
