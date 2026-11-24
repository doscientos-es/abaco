import { createFileRoute, redirect } from '@tanstack/react-router'

import { can, requirePermission, sessionQuery } from '@/features/auth'
import { SettingsPage, UserSettingsPage } from '@/features/settings'

const tabs = [
  'empresa',
  'operativa',
  'cuenta',
  'interfaz',
  'integraciones',
  'documentos',
  'listas',
  'equipo',
  'plan',
  'novedades',
] as const

export const Route = createFileRoute('/ajustes')({
  beforeLoad: async ({ context, search }) => {
    await requirePermission('settings:personal')({ context })
    if (search.tab === 'equipo') {
      const session = await context.queryClient.ensureQueryData(sessionQuery)
      if (can(session?.role, 'team:manage')) {
        throw redirect({ to: '/trabajadores', replace: true })
      }
    }
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
  ): {
    tab?: (typeof tabs)[number]
    pago?: string
    calendar?: 'connected' | 'error'
    stripe?: 'connected' | 'error'
    seccion?: 'referidos'
  } => {
    const pago = typeof search.pago === 'string' ? search.pago : undefined
    const tab = tabs.find((t) => t === search.tab) ?? (pago ? 'plan' : undefined)
    const calendar =
      search.calendar === 'connected' || search.calendar === 'error' ? search.calendar : undefined
    const stripe =
      search.stripe === 'connected' || search.stripe === 'error' ? search.stripe : undefined
    const seccion = tab === 'plan' && search.seccion === 'referidos' ? 'referidos' : undefined
    return {
      ...(tab ? { tab } : {}),
      ...(pago ? { pago } : {}),
      ...(calendar ? { calendar } : {}),
      ...(stripe ? { stripe } : {}),
      ...(seccion ? { seccion } : {}),
    }
  },
  component: SettingsRoute,
})

function SettingsRoute() {
  // The route context changes only after the root has loaded the admin store.
  const { session } = Route.useRouteContext()
  return session?.role === 'admin' ? <SettingsPage /> : <UserSettingsPage />
}
