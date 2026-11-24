import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DialogContent,
  DialogFooter,
  DialogRoot,
  DialogTrigger,
} from '@doscientos/ui'
import type { ReactNode } from 'react'

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
  return (
    <DialogRoot>
      <Card variant="flat">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="bg-muted/60 flex size-11 shrink-0 items-center justify-center rounded-lg">
              <img src={logo} alt="" className="size-7" />
            </span>
            <div role="status" className="flex flex-wrap gap-1.5">
              {status}
            </div>
          </div>
          <div className="space-y-1">
            <CardTitle role="heading" aria-level={3}>
              {name}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </CardHeader>
        {feedback ? <CardContent className="space-y-1.5 text-sm">{feedback}</CardContent> : null}
        <CardFooter className="mt-auto justify-end">
          <DialogTrigger
            aria-label={`${actionLabel}: ${name}`}
            size="sm"
            variant={connectAction ? 'default' : 'outline'}
          >
            {actionLabel}
          </DialogTrigger>
        </CardFooter>
      </Card>
      <DialogContent title={dialogTitle} description={description}>
        {children}
        {dialogActions ? <DialogFooter>{dialogActions}</DialogFooter> : null}
      </DialogContent>
    </DialogRoot>
  )
}
