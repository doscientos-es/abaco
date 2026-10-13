import {
  Button,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '@doscientos/ui'
import type { FormEvent, ReactNode } from 'react'

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
  onSubmit,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  submitLabel: string
  submitDisabled?: boolean
  onSubmit: () => void
  children: ReactNode
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!submitDisabled) onSubmit()
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader className="pr-8">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">{children}</div>
          <DialogFooter>
            <DialogClose variant="outline">Cancelar</DialogClose>
            <Button type="submit" isDisabled={submitDisabled}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
