import { Button } from '@doscientos/ui'
import { MicrophoneIcon } from '@phosphor-icons/react'
import { useId, useRef, useState } from 'react'

import { TextareaField } from '@/shared/ui/form'

import { useLocalVisitDictation } from './use-local-visit-dictation'

const phaseMessage = {
  idle: '',
  checking: 'Comprobando si el español está disponible en este dispositivo…',
  ready: 'Español disponible. El micrófono solo se abrirá si inicias el dictado.',
  requesting: 'Esperando acceso al micrófono…',
  listening: 'Escuchando en español. Puedes detener el dictado en cualquier momento.',
  processing: 'Procesando el texto en tu dispositivo…',
  review: 'Dictado terminado. Revisa el texto antes de añadirlo.',
  fallback: '',
}

export function VisitReportDictation({
  notes,
  maxLength,
  disabled,
  onAppend,
}: {
  notes: string
  maxLength: number
  disabled: boolean
  onAppend: (notes: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const toggle = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const headingId = useId()
  const { status, text, updateText, check, start, stop, reset } = useLocalVisitDictation(
    open && !disabled,
  )
  const active = ['requesting', 'listening', 'processing'].includes(status.phase)
  const addition = text.trim()
  const separator = notes && !notes.endsWith('\n') ? '\n' : ''
  const nextNotes = notes + separator + addition
  const exceedsLimit = Boolean(addition) && nextNotes.length > maxLength
  const primaryUnavailable =
    disabled ||
    status.phase === 'checking' ||
    status.phase === 'processing' ||
    (!active && !!addition)
  const primaryLabel =
    status.phase === 'ready'
      ? 'Iniciar dictado en español'
      : active
        ? 'Detener dictado'
        : status.phase === 'idle'
          ? 'Comprobar dictado local'
          : 'Volver a comprobar'

  function close(added: boolean) {
    reset()
    setOpen(false)
    setAnnouncement(added ? 'Texto añadido al borrador. Guarda el parte para enviarlo.' : '')
    toggle.current?.focus()
  }

  return (
    <div className="min-w-0">
      <Button
        ref={toggle}
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 max-sm:w-full"
        aria-expanded={open}
        {...(open ? { 'aria-controls': panelId } : {})}
        isDisabled={disabled}
        onPress={() => {
          if (open) close(false)
          else {
            setAnnouncement('')
            setOpen(true)
          }
        }}
      >
        <MicrophoneIcon size={18} aria-hidden="true" />
        {open ? 'Cerrar y descartar dictado' : 'Dictar notas'}
      </Button>
      <output className={announcement ? 'text-muted-foreground mt-2 block text-sm' : 'sr-only'}>
        {announcement}
      </output>
      {open ? (
        <section
          id={panelId}
          aria-labelledby={headingId}
          className="border-border bg-muted/30 mt-2 min-w-0 space-y-3 rounded-lg border p-3"
        >
          <h5 id={headingId} className="text-sm font-semibold">
            Dictado de notas
          </h5>
          <p className="text-muted-foreground text-sm">
            Si tu navegador admite dictado local, la voz se procesa en este dispositivo. Aquí puedes
            revisar el texto antes de añadirlo al borrador.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              className="min-h-11"
              variant={status.phase === 'ready' ? 'default' : 'outline'}
              aria-disabled={primaryUnavailable}
              onPress={() => {
                if (primaryUnavailable) return
                if (status.phase === 'ready') start()
                else if (active) stop()
                else void check()
              }}
            >
              {primaryLabel}
            </Button>
          </div>
          <output className="text-muted-foreground block text-sm empty:sr-only">
            {status.message ?? phaseMessage[status.phase]}
          </output>
          <fieldset disabled={disabled || active} className="min-w-0">
            <TextareaField
              label="Vista previa del dictado"
              value={text}
              onChange={updateText}
              maxLength={maxLength}
              placeholder="Revisa o escribe aquí el texto"
            />
          </fieldset>
          <p className="text-muted-foreground text-sm">
            También puedes tocar la vista previa y usar el micrófono de tu teclado si aparece.
            Comprueba su idioma y sus opciones de privacidad en los ajustes de tu dispositivo.
          </p>
          {exceedsLimit ? (
            <p role="alert" className="text-destructive text-sm">
              Acorta el texto: las notas no pueden superar {maxLength} caracteres.
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              className="min-h-11"
              isDisabled={disabled || active || !addition || exceedsLimit}
              onPress={() => {
                if (!disabled && !active && addition && !exceedsLimit) {
                  onAppend(nextNotes)
                  close(true)
                }
              }}
            >
              Añadir a las notas
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onPress={() => close(false)}>
              Cerrar y descartar
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
