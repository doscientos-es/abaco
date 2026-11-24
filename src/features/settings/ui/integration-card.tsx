import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '@doscientos/ui'
import { useId, type ReactNode } from 'react'

type IntegrationCardProps = {
  name: string
  logo: string
  description: string
  status: ReactNode
  feedback?: ReactNode
  actionLabel: string
  connectAction?: boolean
  dialogTitle: string
  dialogActions?: ReactNode
  children: ReactNode
}

export function IntegrationCard({
  name,
  logo,
  description,
  status,
  feedback,
  actionLabel,
  connectAction,
  dialogTitle,
  dialogActions,
  children,
}: IntegrationCardProps) {
  const descriptionId = useId()

  return (
    <DialogRoot>
      <Card variant="flat">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="bg-muted/60 flex size-11 shrink-0 items-center justify-center rounded-lg">
              <img src={logo} alt="" className="size-7" />
            </span>
            <output className="flex flex-wrap gap-1.5">{status}</output>
          </div>
          <div className="space-y-1">
            <CardTitle>
              <h3>{name}</h3>
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </CardHeader>
        {feedback ? <CardContent className="space-y-1.5 text-sm">{feedback}</CardContent> : null}
        <CardFooter className="mt-auto justify-end">
          <DialogTrigger
            aria-haspopup="dialog"
            aria-label={`${actionLabel}: ${name}`}
            size="sm"
            variant={connectAction ? 'default' : 'outline'}
          >
            {actionLabel}
          </DialogTrigger>
        </CardFooter>
      </Card>
      <DialogContent
        aria-describedby={descriptionId}
        className="app-dialog max-h-[90dvh] w-full overflow-y-auto"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription id={descriptionId}>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Estado:</span>
          <output className="flex flex-wrap gap-1.5">{status}</output>
        </div>
        {feedback ? <div className="space-y-1.5 text-sm">{feedback}</div> : null}
        {children}
        {dialogActions ? <DialogFooter>{dialogActions}</DialogFooter> : null}
      </DialogContent>
    </DialogRoot>
  )
}
