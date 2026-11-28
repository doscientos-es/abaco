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
import { UserFrame } from '@/app/technician-frame'
import { NoCompanyPage, rememberReferral, sessionQuery } from '@/features/auth'
import { SubscriptionAccessPage, tenantAccessQuery } from '@/features/billing'
import { equipmentScanPath, tagFromFragment } from '@/features/equipment-labels'
import { companyOnboardingQuery, onboardingDestination } from '@/features/onboarding'
import { hydrateStore, refreshStore, setActiveTenantId } from '@/shared/store/store'
import { PageError, PageNotFound } from '@/shared/ui/page-states'

/** Screens reachable without being signed in. */
const publicPaths = [
  '/entrar',
  '/registro',
  '/recuperar',
  '/confirmar',
  '/precios',
  '/acceso-google',
  '/cita',
]
/** Signed-in users have no reason to see these. */
const guestOnlyPaths = ['/entrar', '/registro', '/recuperar']
/** Customer links need no account, even if someone is signed in. */
const isPublicPath = (path: string) =>
  publicPaths.includes(path) || path.startsWith('/p/') || path.startsWith('/i/')

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    // Invalidated sessions must be refreshed before deciding whether to redirect.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    const cached = context.queryClient.getQueryState(sessionQuery.queryKey)
    if (offline && (!cached || cached.isInvalidated || cached.data === undefined)) {
      throw new Error('Se necesita conexión para comprobar la sesión.')
    }
    const session = offline
      ? (cached?.data ?? null)
      : await context.queryClient.fetchQuery(sessionQuery)
    const path = location.pathname
    if (!session && typeof window !== 'undefined' && path !== '/cita')
      rememberReferral(location.searchStr)
    const isPlatformPage = path === '/superadmin'
    if (!session && !isPublicPath(path)) {
      if (path === equipmentScanPath) {
        const token = tagFromFragment(location.hash)
        throw redirect({
          to: '/entrar',
          search: { redirect: equipmentScanPath },
          ...(token ? { hash: token } : {}),
          replace: true,
        })
      }
      throw redirect({ to: '/entrar', search: { redirect: location.href }, replace: true })
    }
    if (session && guestOnlyPaths.includes(path)) throw redirect({ to: '/', replace: true })
    if (
      session?.tenantId &&
      !isPublicPath(path) &&
      !isPlatformPage &&
      path !== '/nueva-contrasena'
    ) {
      const query = companyOnboardingQuery(session.tenantId)
      const cachedOnboarding = context.queryClient.getQueryState(query.queryKey)
      if (
        offline &&
        (!cachedOnboarding || cachedOnboarding.isInvalidated || cachedOnboarding.data === undefined)
      ) {
        throw new Error('Se necesita conexión para comprobar el alta de la empresa.')
      }
      const onboarding = offline
        ? cachedOnboarding?.data
        : await context.queryClient.fetchQuery(query)
      const destination = onboardingDestination(onboarding?.stage, path)
      if (destination) throw redirect({ to: destination, replace: true })
    }
    if (
      session?.role === 'user' &&
      !isPublicPath(path) &&
      !isPlatformPage &&
      path !== '/ajustes' &&
      path !== '/mi-jornada' &&
      path !== equipmentScanPath &&
      path !== '/horarios' &&
      path !== '/mis-vacaciones' &&
      path !== '/nueva-contrasena' &&
      path !== '/bienvenida'
    ) {
      throw redirect({ to: '/mi-jornada', replace: true })
    }
    let hasTenantAccess = false
    if (
      session?.role &&
      session.tenantId &&
      !isPublicPath(path) &&
      !isPlatformPage &&
      path !== '/nueva-contrasena' &&
      path !== '/bienvenida'
    ) {
      const access = tenantAccessQuery(session.tenantId)
      const cachedAccess = context.queryClient.getQueryState(access.queryKey)
      if (
        offline &&
        (!cachedAccess || cachedAccess.isInvalidated || cachedAccess.data === undefined)
      ) {
        throw new Error('Se necesita conexión para comprobar la suscripción.')
      }
      hasTenantAccess = offline
        ? cachedAccess?.data === true
        : await context.queryClient.fetchQuery(access)
      if (!hasTenantAccess && path !== '/ajustes' && path !== '/bienvenida') {
        throw redirect({ to: '/ajustes', search: { tab: 'plan' }, replace: true })
      }
    }
    // The payment screen must remain available without fetching business data.
    if (hasTenantAccess && session?.role === 'admin' && !isPublicPath(path) && !isPlatformPage) {
      await hydrateStore()
      // Follows the company chosen in the session.
      if (session.tenantId) setActiveTenantId(session.tenantId)
    }
    return { session, hasTenantAccess }
  },
  component: RootLayout,
  errorComponent: PageError,
  notFoundComponent: () => <PageNotFound />,
})

function RootLayout() {
  const { session, hasTenantAccess } = Route.useRouteContext()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isPublic = isPublicPath(pathname) || pathname === '/nueva-contrasena'
  const inOffice =
    hasTenantAccess && session?.role === 'admin' && !isPublic && pathname !== '/superadmin'

  // Picks up changes made elsewhere (a client accepting an estimate) when the user comes back to the tab.
  useEffect(() => {
    if (!inOffice) return
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
  }, [inOffice])

  if (isPublic || !session) return <Outlet />
  // Platform access is independent of the user's current company membership.
  if (pathname === '/superadmin') return <Outlet />
  if (!session.role) return <NoCompanyPage />
  if (pathname === '/bienvenida') return <Outlet />
  if (!hasTenantAccess) return <SubscriptionAccessPage />
  const workspaceKey = `${session.userId}:${session.tenantId}`
  if (session.role === 'user') {
    return (
      <UserFrame key={workspaceKey}>
        <Outlet />
      </UserFrame>
    )
  }
  return (
    <AppFrame key={workspaceKey}>
      <Outlet />
      <Toaster />
    </AppFrame>
  )
}
