import { Button, Toaster } from '@doscientos/ui'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { useSession, useSignOut } from '@/features/auth'
import { brand } from '@/shared/lib/brand'

/** User pages never hydrate the office store or expose its financial data. */
export function UserFrame({ children }: { children: ReactNode }) {
  const session = useSession()
  const signOut = useSignOut()
  const company = session?.companies.find((item) => item.id === session.tenantId)

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-primary text-lg font-semibold">{brand.name}</p>
            <p className="text-muted-foreground text-xs">
              {company?.name ?? 'Mi empresa'} · Usuario
            </p>
          </div>
          <nav aria-label="Navegación de usuario" className="flex flex-wrap items-center gap-2">
            <Link
              to="/mi-jornada"
              className="text-primary rounded-md px-2 py-2 text-sm font-medium underline"
            >
              Mi jornada
            </Link>
            <Link
              to="/mis-vacaciones"
              className="text-primary rounded-md px-2 py-2 text-sm font-medium underline"
            >
              Mis vacaciones
            </Link>
            <Link
              to="/ajustes"
              className="text-primary rounded-md px-2 py-2 text-sm font-medium underline"
            >
              Ajustes
            </Link>
            <Button variant="outline" onPress={() => void signOut()}>
              Cerrar sesión
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      <Toaster />
    </div>
  )
}
