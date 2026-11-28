import {
  Button,
  buttonVariants,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '@doscientos/ui'
import { Bell } from '@phosphor-icons/react'
import { useId, useRef, useState } from 'react'

import type { Client } from '@/shared/domain/types'
import { whatsappLink } from '@/shared/lib/whatsapp'

import type { loadEstimateReminder } from '../application/estimate-publication-actions'
import {
  estimateReminderLink,
  estimateReminderMessage,
  estimateReminderPhone,
} from '../domain/estimate-reminder'

type Reminder = Awaited<ReturnType<typeof loadEstimateReminder>>
type Preview = Pick<Reminder, 'recipient' | 'clientId'> & { link: string }
type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; preview: Preview }

export function EstimateReminderDialog({
  tenantId,
  estimateId,
  client,
  load,
}: {
  tenantId: string
  estimateId: string
  client: Client | undefined
  load: typeof loadEstimateReminder
}) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [draft, setDraft] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const request = useRef(0)
  const messageId = useId()

  async function prepare() {
    const version = ++request.current
    setState({ kind: 'loading' })
    setDraft('')
    setCopyStatus('')
    try {
      const { token, ...reminder } = await load(tenantId, estimateId)
      const link = estimateReminderLink(window.location.origin, token)
      if (version !== request.current) return
      setDraft(estimateReminderMessage(reminder))
      setState({
        kind: 'ready',
        preview: { link, recipient: reminder.recipient, clientId: reminder.clientId },
      })
    } catch (error) {
      if (version !== request.current) return
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'No se pudo preparar el recordatorio.',
      })
    }
  }

  function changeOpen(next: boolean) {
    setOpen(next)
    if (next) void prepare()
    else {
      ++request.current
      setState({ kind: 'loading' })
      setDraft('')
      setCopyStatus('')
    }
  }

  const preview = state.kind === 'ready' ? state.preview : null
  const recipientContact =
    client?.id === preview?.clientId && client?.tenantId === tenantId ? client : null
  const phone = estimateReminderPhone(recipientContact?.phone ?? '')
  const email = recipientContact?.email.trim()
  const message = preview && draft.trim() ? `${draft.trim()}\n\n${preview.link}` : ''

  async function copyMessage() {
    if (!message) return
    const version = request.current
    try {
      await navigator.clipboard.writeText(message)
      if (version === request.current) setCopyStatus('Mensaje copiado. Todavía no se ha enviado.')
    } catch {
      if (version === request.current)
        setCopyStatus(
          'No se pudo copiar. Puedes seleccionar el mensaje y el enlace para copiarlos.',
        )
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={changeOpen}>
      <DialogTrigger variant="outline" className="min-h-11">
        <Bell aria-hidden="true" className="size-4 shrink-0" />
        Preparar recordatorio
      </DialogTrigger>
      <DialogContent className="app-dialog max-h-[90dvh] w-full overflow-y-auto">
        <DialogHeader className="pr-8">
          <DialogTitle>Recordatorio de presupuesto</DialogTitle>
          <DialogDescription>
            Revisa el destinatario y el mensaje. No se envía nada desde Menos Líos.
          </DialogDescription>
        </DialogHeader>
        {state.kind === 'loading' ? (
          <output className="text-muted-foreground text-sm">Comprobando el enlace vigente…</output>
        ) : null}
        {state.kind === 'error' ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm">
              {state.message}
            </p>
            <Button variant="outline" onPress={() => void prepare()}>
              Volver a comprobar
            </Button>
          </div>
        ) : null}
        {preview ? (
          <div className="min-w-0 space-y-4">
            <dl className="space-y-1 text-sm wrap-break-word">
              <div>
                <dt className="font-medium">Destinatario</dt>
                <dd>{preview.recipient}</dd>
              </div>
              {email ? (
                <div>
                  <dt className="font-medium">Correo de la ficha</dt>
                  <dd>{email}</dd>
                </div>
              ) : null}
              {phone ? (
                <div>
                  <dt className="font-medium">Número de WhatsApp</dt>
                  <dd>{phone}</dd>
                </div>
              ) : null}
            </dl>
            <div className="grid min-w-0 gap-1.5">
              <label htmlFor={messageId} className="text-sm font-medium">
                Mensaje editable
              </label>
              <textarea
                id={messageId}
                className="border-input bg-background min-h-36 w-full min-w-0 resize-y rounded-md border px-3 py-2 text-base sm:text-sm"
                rows={6}
                maxLength={2000}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  setCopyStatus('')
                }}
              />
              <p className="text-muted-foreground text-sm">Enlace incluido al final del mensaje:</p>
              <p className="text-sm wrap-anywhere">{preview.link}</p>
            </div>
            {!phone ? (
              <p className="text-muted-foreground text-sm">
                No hay un número de WhatsApp válido en la ficha. Puedes copiar el mensaje para
                compartirlo por otro medio.
              </p>
            ) : null}
            <output className="text-sm">{copyStatus}</output>
          </div>
        ) : null}
        <DialogFooter className="flex-wrap">
          <DialogClose variant="outline" className="min-h-11">
            Cerrar
          </DialogClose>
          {preview ? (
            <Button className="min-h-11" isDisabled={!message} onPress={() => void copyMessage()}>
              Copiar mensaje
            </Button>
          ) : null}
          {phone && message ? (
            <a
              className={buttonVariants({ variant: 'outline', className: 'min-h-11' })}
              href={whatsappLink(phone, message)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir borrador en WhatsApp
            </a>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}
