import { createFileRoute, redirect } from '@tanstack/react-router'

import { can, requirePermission, sessionQuery } from '@/features/auth'
import { SettingsPage, UserSettingsPage } from '@/features/settings'

const tabs = [
  'empresa',
  'operativa',
  'cuenta',
  'documentos',
  'listas',
  'equipo',
  'plan',
  'novedades',
] as const

export const Route = createFileRoute('/ajustes')({
  beforeLoad: async ({ context, search }) => {
    await requirePermission('settings:personal')({ context })
    if (search.tab === 'documentos' || search.tab === 'listas') {
      const session = await context.queryClient.ensureQueryData(sessionQuery)
      if (can(session?.role, 'settings:write')) {
        throw redirect({ to: '/personalizar', search: { tab: search.tab }, replace: true })
      }
    }
  },
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
