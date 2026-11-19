import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '@doscientos/ui'
import type { ReactNode } from 'react'

export function CalendarDetailsDialog({
  title,
  description,
  onClose,
  children,
  preventDismissal = false,
}: {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
  preventDismissal?: boolean
}) {
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open && !preventDismissal) onClose()
      }}
    >
      <DialogContent
        className="app-dialog app-dialog--details max-h-[90dvh] w-full overflow-y-auto"
        showCloseButton={!preventDismissal}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">{children}</div>
      </DialogContent>
    </DialogRoot>
  )
}
