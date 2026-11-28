import {
  Button,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '@doscientos/ui'
import { Clock, Copy } from '@phosphor-icons/react'
import { useId, useRef, useState } from 'react'

import {
  visitDelayDraft,
  visitDelayTimeError,
  type DelayNoticeVisit,
} from '../domain/visit-delay-notice'

type CopyStatus = 'idle' | 'copying' | 'copied' | 'failed'

export function WorkerVisitDelayNotice({
  visit,
  hasSharedContact,
}: {
  visit: DelayNoticeVisit
  hasSharedContact: boolean
}) {
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copy, setCopy] = useState<CopyStatus>('idle')
  const version = useRef(0)
  const timeId = useId()
  const messageId = useId()
  const helpId = useId()

  function onOpenChange(next: boolean) {
    ++version.current
    setOpen(next)
    setTime('')
    setDraft(null)
    setError('')
    setCopy('idle')
  }

  function prepare() {
    const invalid = visitDelayTimeError(visit, time, Date.now())
    setError(invalid ?? '')
    setDraft(invalid ? null : visitDelayDraft(time))
    setCopy('idle')
  }

  async function copyDraft() {
    if (copy === 'copying' || !draft?.trim()) return
    const invalid = visitDelayTimeError(visit, time, Date.now())
    if (invalid) {
      setError(invalid)
      setDraft(null)
      return
    }
    const current = version.current
    setCopy('copying')
    try {
      await navigator.clipboard.writeText(draft.trim())
      if (version.current === current) setCopy('copied')
    } catch {
      if (version.current === current) setCopy('failed')
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogTrigger variant="outline" className="min-h-11">
        <Clock aria-hidden="true" className="size-4 shrink-0" />
        Preparar aviso de retraso
      </DialogTrigger>
      <DialogContent
        className="app-dialog max-h-[90dvh] w-full overflow-y-auto"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Aviso de retraso</DialogTitle>
          <DialogDescription>
            Indica una hora estimada de llegada para hoy. Esto no cambia tu agenda ni envía un
            mensaje.
          </DialogDescription>
        </DialogHeader>
        <form
          className="min-w-0 space-y-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            prepare()
          }}
        >
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor={timeId} className="text-sm font-medium">
              Nueva hora estimada de llegada
            </label>
            <input
              id={timeId}
              type="time"
              value={time}
              onChange={(event) => {
                ++version.current
                setTime(event.target.value)
                setDraft(null)
                setError('')
                setCopy('idle')
              }}
              className="border-input bg-background min-h-11 w-full min-w-0 rounded-md border px-3 py-2 text-base sm:text-sm"
              aria-describedby={helpId}
              aria-invalid={error ? true : undefined}
              required
            />
            <p id={helpId} className="text-muted-foreground text-sm">
              Usa la hora local del centro ({visit.timezone}). Si la llegada será otro día, confirma
              el cambio con tu equipo.
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-sm">
              {error}
            </p>
          ) : null}
          {draft === null ? (
            <Button type="submit" variant="outline" className="min-h-11">
              Preparar borrador
            </Button>
          ) : null}
        </form>
        <p className="text-muted-foreground text-sm">
          {hasSharedContact
            ? 'Consulta el contacto compartido en la ficha de llegada antes de enviar el mensaje por tu canal autorizado.'
            : 'No hay un contacto compartido disponible para este aviso. Si lo necesitas, copia el mensaje para la oficina.'}
        </p>
        {draft !== null ? (
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor={messageId} className="text-sm font-medium">
              Mensaje editable
            </label>
            <textarea
              id={messageId}
              className="border-input bg-background min-h-38 w-full min-w-0 resize-y rounded-md border px-3 py-2 text-base sm:text-sm"
              value={draft}
              maxLength={1000}
              rows={5}
              onChange={(event) => {
                ++version.current
                setDraft(event.target.value)
                setCopy('idle')
              }}
            />
            {copy === 'failed' ? (
              <p role="alert" className="text-sm">
                No se pudo copiar automáticamente. Selecciona el mensaje y cópialo manualmente.
              </p>
            ) : (
              <output className="text-muted-foreground text-sm">
                {copy === 'copied' ? 'Mensaje copiado. No se ha enviado.' : ''}
              </output>
            )}
          </div>
        ) : null}
        <DialogFooter className="flex-wrap">
          <DialogClose variant="outline" className="min-h-11">
            Cerrar
          </DialogClose>
          {draft !== null ? (
            <Button
              className="min-h-11"
              isDisabled={!draft.trim() || copy === 'copying'}
              onPress={() => void copyDraft()}
            >
              <Copy aria-hidden="true" className="size-4 shrink-0" />
              Copiar mensaje
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}
