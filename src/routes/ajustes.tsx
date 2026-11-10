import { createFileRoute } from '@tanstack/react-router'

import { requirePermission, useSession } from '@/features/auth'
import { SettingsPage, UserSettingsPage } from '@/features/settings'

const tabs = ['empresa', 'documentos', 'equipo', 'plan', 'novedades'] as const

export const Route = createFileRoute('/ajustes')({
  beforeLoad: requirePermission('settings:personal'),
  // `pago` lo añade Redsys al volver: lleva directo a la pestaña del plan.
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: (typeof tabs)[number]; pago?: string } => {
    const pago = typeof search.pago === 'string' ? search.pago : undefined
    const tab = tabs.find((t) => t === search.tab) ?? (pago ? 'plan' : undefined)
    return { ...(tab ? { tab } : {}), ...(pago ? { pago } : {}) }
  },
  component: SettingsRoute,
})

function SettingsRoute() {
  const session = useSession()
  return session?.role === 'admin' ? <SettingsPage /> : <UserSettingsPage />
}
