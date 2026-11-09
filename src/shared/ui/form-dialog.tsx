import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '@doscientos/ui'
import { useState, type FormEvent, type ReactNode } from 'react'

/**
 * Modal form for create/edit flows. Scrolls inside the viewport, submits with Enter
 * and is announced by screen readers through its title and description.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submitDisabled = false,
  isSubmitting = false,
  isDirty = false,
  compact = false,
  onSubmit,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  submitLabel: string
  submitDisabled?: boolean
  isSubmitting?: boolean
  isDirty?: boolean
  compact?: boolean
  onSubmit: () => void
  children: ReactNode
}) {
  const [discardOpen, setDiscardOpen] = useState(false)

  function requestOpenChange(next: boolean) {
    if (isSubmitting) return
    if (!next && isDirty) setDiscardOpen(true)
    else onOpenChange(next)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!submitDisabled && !isSubmitting) onSubmit()
  }

  return (
    <>
      <DialogRoot open={open} onOpenChange={requestOpenChange}>
        <DialogContent
          className={
            compact
              ? 'max-h-[90dvh] w-full max-w-full overflow-y-auto sm:max-w-lg'
              : 'max-h-[90dvh] w-full max-w-full overflow-y-auto sm:max-w-xl'
          }
          showCloseButton={!isSubmitting}
        >
          <form onSubmit={handleSubmit} className="grid gap-5" aria-busy={isSubmitting}>
            <DialogHeader className="pr-8">
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </DialogHeader>
            <fieldset disabled={isSubmitting} className="grid min-w-0 gap-4 sm:grid-cols-2">
              {children}
            </fieldset>
            <DialogFooter className="border-border border-t pt-4">
              <Button
                variant="outline"
                isDisabled={isSubmitting}
                onPress={() => requestOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" isDisabled={submitDisabled || isSubmitting}>
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogRoot>
      <AlertDialog open={open && discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Los cambios de este formulario todavía no se han guardado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <Button
              variant="destructive"
              onPress={() => {
                setDiscardOpen(false)
                onOpenChange(false)
              }}
            >
              Descartar cambios
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
