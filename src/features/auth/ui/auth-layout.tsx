import type { ReactNode } from 'react'

import doscientosLogo from '@/shared/assets/logo.svg'
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
    <main className="auth-bg flex min-h-svh items-center justify-center p-4">
      <span className="auth-blob" aria-hidden="true" />
      <div className="w-full max-w-sm space-y-7">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/abaco-logo.svg" alt={brand.name} className="h-16 w-auto" />
          <p className="text-sm text-[#2a4227]/80">{brand.tagline}</p>
        </div>
        <section className="space-y-5 rounded-2xl border border-white/70 bg-white/80 p-7 shadow-xl shadow-[#2a4227]/10 backdrop-blur-xl">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
          </header>
          {children}
        </section>
        {footer ? <div className="text-center text-sm text-[#2a4227]/80">{footer}</div> : null}
        <a
          href={brand.makerUrl}
          target="_blank"
          rel="noopener"
          className="flex items-center justify-center gap-1.5 text-xs text-[#2a4227]/70 hover:text-[#2a4227]"
        >
          Un producto de
          <img src={doscientosLogo} alt={brand.maker} className="h-3 w-auto" />
        </a>
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
