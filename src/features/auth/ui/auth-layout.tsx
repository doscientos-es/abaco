import type { ReactNode } from 'react'

import { brand } from '@/shared/lib/brand'

/** Centered card shared by every public auth screen. */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string | undefined
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center leading-tight">
          <p className="text-xl font-semibold tracking-tight">{brand.name}</p>
          <p className="text-muted-foreground text-xs">{brand.byline}</p>
        </div>
        <section className="border-border bg-card space-y-5 rounded-lg border p-6 shadow-sm">
          <header className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
          </header>
          {children}
        </section>
        {footer ? <div className="text-muted-foreground text-center text-sm">{footer}</div> : null}
      </div>
    </main>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  )
}
