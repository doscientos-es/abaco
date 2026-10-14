import { Toaster } from '@doscientos/ui'
import type { QueryClient } from '@tanstack/react-query'
import { Outlet, createRootRouteWithContext, redirect, useRouterState } from '@tanstack/react-router'

import { AppFrame } from '@/app/app-frame'
import { NoCompanyPage, sessionQuery } from '@/features/auth'
import { hydrateStore, setActiveTenantId } from '@/shared/store/store'
import { PageError, PageNotFound } from '@/shared/ui/page-states'

/** Screens reachable without being signed in. */
const publicPaths = ['/entrar', '/registro', '/recuperar', '/confirmar']
/** Signed-in users have no reason to see these. */
const guestOnlyPaths = ['/entrar', '/registro', '/recuperar']

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery)
    const path = location.pathname
    if (!session && !publicPaths.includes(path)) {
      throw redirect({ to: '/entrar', search: { redirect: location.href }, replace: true })
    }
    if (session && guestOnlyPaths.includes(path)) throw redirect({ to: '/', replace: true })
    // Screens read the store synchronously, so the data must be loaded before they render.
    if (session?.role && !publicPaths.includes(path)) {
      await hydrateStore()
      // Follows the company chosen in the session.
      if (session.tenantId) setActiveTenantId(session.tenantId)
    }
    return { session }
  },
  component: RootLayout,
  errorComponent: PageError,
  notFoundComponent: () => <PageNotFound />,
})

function RootLayout() {
  const { session } = Route.useRouteContext()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isPublic = publicPaths.includes(pathname) || pathname === '/nueva-contrasena'

  if (isPublic || !session) return <Outlet />
  if (!session.role) return <NoCompanyPage />
  return (
    <AppFrame>
      <Outlet />
      <Toaster />
    </AppFrame>
  )
}


