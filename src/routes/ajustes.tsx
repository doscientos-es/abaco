import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '@/features/auth'
import { SettingsPage, UserSettingsPage } from '@/features/settings'

const tabs = ['empresa', 'documentos', 'listas', 'equipo', 'plan', 'novedades'] as const

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
  // The route context changes only after the root has loaded the admin store.
  const { session } = Route.useRouteContext()
  return session?.role === 'admin' ? <SettingsPage /> : <UserSettingsPage />
}
