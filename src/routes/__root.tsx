import { Toaster } from '@doscientos/ui'
import type { QueryClient } from '@tanstack/react-query'
import {
  Outlet,
  createRootRouteWithContext,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect } from 'react'

import { AppFrame } from '@/app/app-frame'
import { TechnicianFrame } from '@/app/technician-frame'
import { NoCompanyPage, sessionQuery, welcomeRedirect } from '@/features/auth'
import { hydrateStore, refreshStore, setActiveTenantId } from '@/shared/store/store'
import { PageError, PageNotFound } from '@/shared/ui/page-states'

/** Screens reachable without being signed in. */
const publicPaths = ['/entrar', '/registro', '/recuperar', '/confirmar']
/** Signed-in users have no reason to see these. */
const guestOnlyPaths = ['/entrar', '/registro', '/recuperar']
/** Customer links need no account, even if someone is signed in. */
const isPublicPath = (path: string) =>
  publicPaths.includes(path) || path.startsWith('/p/') || path.startsWith('/i/')

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery)
    const path = location.pathname
    if (!session && !isPublicPath(path)) {
      throw redirect({ to: '/entrar', search: { redirect: location.href }, replace: true })
    }
    if (session && guestOnlyPaths.includes(path)) throw redirect({ to: '/', replace: true })
    if (
      session?.role === 'technician' &&
      !isPublicPath(path) &&
      path !== '/mi-jornada' &&
      path !== '/nueva-contrasena'
    ) {
      throw redirect({ to: '/mi-jornada', replace: true })
    }
    if (session && !isPublicPath(path)) {
      const destination = welcomeRedirect(session.needsWelcome, path)
      if (destination) throw redirect({ to: destination, replace: true })
    }
    // Screens read the store synchronously, so the data must be loaded before they render.
    if (session?.role && session.role !== 'technician' && !isPublicPath(path)) {
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
  const isPublic = isPublicPath(pathname) || pathname === '/nueva-contrasena'
  const signedIn = Boolean(session?.role && session.role !== 'technician') && !isPublic

  // Picks up changes made elsewhere (a client accepting an estimate) when the user comes back to the tab.
  useEffect(() => {
    if (!signedIn) return
    const refresh = () => refreshStore()
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [signedIn])

  if (isPublic || !session) return <Outlet />
  if (!session.role) return <NoCompanyPage />
  if (pathname === '/bienvenida') return <Outlet />
  if (session.role === 'technician') {
    return (
      <TechnicianFrame>
        <Outlet />
      </TechnicianFrame>
    )
  }
  return (
    <AppFrame>
      <Outlet />
      <Toaster />
    </AppFrame>
  )
}
