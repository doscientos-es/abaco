import { IconContext } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import { ChartContent } from './chart-content'

export function ChartCard({
  title,
  description,
  settings,
  children,
  className = '',
}: {
  title: string
  description?: string
  settings?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`border-border bg-card rounded-xl border p-3 md:p-4 ${className}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mb-3 text-xs max-md:mb-2">{description}</p>
      ) : (
        <div className="mb-3" />
      )}
      {settings ? (
        <fieldset className="border-border mb-3 flex min-w-0 flex-wrap items-center gap-2 border-b pb-3 max-md:mb-2 max-md:gap-1.5 max-md:pb-2">
          <legend className="sr-only">{`Personalizar ${title}`}</legend>
          {settings}
        </fieldset>
      ) : null}
      <ChartContent title={title}>{children}</ChartContent>
    </section>
  )
}

export function EmptyHint({
  icon,
  title,
  description,
  action,
  className = '',
}: {
  icon?: ReactNode
  title: string
  description?: string | undefined
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center gap-1.5 px-4 py-8 text-center ${className}`}>
      {icon ? (
        <IconContext.Provider value={{ weight: 'duotone' }}>
          <span className="text-primary mb-1 flex size-10 items-center justify-center [&>svg]:size-8">
            {icon}
          </span>
        </IconContext.Provider>
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="text-muted-foreground max-w-xs text-xs leading-relaxed">{description}</p>
      ) : null}
      {action ? <div className="mt-2 text-sm font-medium">{action}</div> : null}
    </div>
  )
}
