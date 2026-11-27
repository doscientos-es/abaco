import { Button } from '@doscientos/ui'
import { CalendarBlankIcon, WarningCircleIcon } from '@phosphor-icons/react'

import './worker-state.css'

export function WorkerLoading({ label }: { label: string }) {
  return (
    <output className="worker-state worker-state--loading">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="worker-skeleton">
        <span />
        <span />
        <span />
      </div>
    </output>
  )
}

export function WorkerState({
  title,
  description,
  error = false,
  onRetry,
  onAction,
  actionLabel,
}: {
  title: string
  description: string
  error?: boolean
  onRetry?: () => void
  onAction?: () => void
  actionLabel?: string
}) {
  const Icon = error ? WarningCircleIcon : CalendarBlankIcon
  return (
    <div
      className={`worker-state${error ? ' worker-state--error' : ''}`}
      role={error ? 'alert' : undefined}
    >
      <span className="worker-state__icon">
        <Icon size={25} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {onAction && actionLabel ? (
        <Button variant="outline" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
      {onRetry ? (
        <Button variant="outline" onPress={onRetry}>
          Volver a intentarlo
        </Button>
      ) : null}
    </div>
  )
}
