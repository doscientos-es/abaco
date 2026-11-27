import {
  AppShell,
  AppShellContent,
  AppShellMain,
  AppShellMobileHeader,
  AppShellSidebar,
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Toaster,
} from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import { roleLabels, useSession, useSignOut, UserAvatar } from '@/features/auth'
import { GlobalSearch, type SearchMode } from '@/features/global-search'
import { NavigationLayoutContext, useNavigationLayout } from '@/features/interface-preferences'
import { platformAccessQuery } from '@/features/superadmin'
import { brand } from '@/shared/lib/brand'

import { MobileBrandLink, SidebarLink, type NavItem } from './frame-navigation'
import { MobileNavigation } from './mobile-navigation'
import { navIcons } from './nav-icons'
import { PlatformMenuSection } from './platform-menu-section'

import './technician-frame.css'

const navigation: NavItem[] = [
  { to: '/mi-jornada', label: 'Mi jornada', icon: navIcons.myDay },
  { to: '/horarios', label: 'Mi horario', icon: navIcons.mySchedule },
  {
    to: '/mis-vacaciones',
    label: 'Mis vacaciones',
    mobileLabel: 'Vacaciones',
    icon: navIcons.myAbsences,
  },
  { to: '/ajustes', label: 'Ajustes', icon: navIcons.settings },
]

/** User pages never hydrate the office store or expose its financial data. */
export function UserFrame({ children }: { children: ReactNode }) {
  const session = useSession()
  const { data: hasPlatformAccess } = useQuery(platformAccessQuery(session?.userId ?? ''))
  const signOut = useSignOut()
  const navigate = useNavigate()
  const company = session?.companies.find((item) => item.id === session.tenantId)
  const userName = session?.fullName || session?.email || 'Usuario'
  const [searchMode, setSearchMode] = useState<SearchMode>(null)
  const navigationLayout = useNavigationLayout({
    tenantId: session?.tenantId ?? '',
    userId: session?.userId ?? '',
    groups: [{ id: 'personal', label: 'Navegación de usuario', items: navigation }],
    choices: navigation,
  })
  const userMenu = (placement: 'top start' | 'bottom end') => (
    <DropdownMenuContent placement={placement}>
      <DropdownMenuLabel>{session?.email ?? ''}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onAction={() => void navigate({ to: '/ajustes' })}>
        Ajustes y empresas
      </DropdownMenuItem>
      {hasPlatformAccess === true ? (
        <>
          <DropdownMenuSeparator />
          <PlatformMenuSection onOpen={() => void navigate({ to: '/superadmin' })} />
          <DropdownMenuSeparator />
        </>
      ) : null}
      <DropdownMenuItem onAction={() => void navigate({ to: '/nueva-contrasena' })}>
        Cambiar contraseña
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onAction={() => void signOut()}>Cerrar sesión</DropdownMenuItem>
    </DropdownMenuContent>
  )

  return (
    <AppShell className="user-frame">
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>
      <AppShellSidebar className="workspace-sidebar hidden h-full w-64 shrink-0 flex-col md:flex">
        <div className="shrink-0 px-3 pt-4 pb-3">
          <Link
            to="/mi-jornada"
            aria-label="Ir a mi jornada"
            className="hover:bg-muted/70 flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 transition-colors"
          >
            <span className="bg-card border-border flex h-10 w-12 shrink-0 items-center justify-center">
              <img src={brand.mark} alt={brand.name} className="h-5 w-auto" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight">
                {company?.name ?? 'Mi empresa'}
              </span>
              <span className="text-muted-foreground block truncate text-xs">{brand.name}</span>
            </span>
          </Link>
        </div>
        <nav
          aria-label="Navegación de usuario"
          className="min-h-0 flex-1 overflow-y-auto px-3 py-1"
        >
          {navigationLayout.desktop.flatMap((group) =>
            group.items.map((item) => <SidebarLink key={item.to} {...item} />),
          )}
        </nav>
        <div className="border-border mt-auto shrink-0 border-t p-3">
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              aria-label="Menú de usuario"
              className="h-auto w-full justify-start gap-3 px-3 py-2"
            >
              <UserAvatar name={userName} avatarUrl={session?.avatarUrl} />
              <span className="min-w-0 text-left leading-tight">
                <span className="block truncate text-sm font-medium">{userName}</span>
                <span className="text-muted-foreground block truncate text-xs font-normal">
                  {session?.role ? roleLabels[session.role] : ''}
                </span>
              </span>
            </Button>
            {userMenu('top start')}
          </DropdownMenuTrigger>
        </div>
      </AppShellSidebar>
      <AppShellMain className="user-frame__main">
        <AppShellMobileHeader className="workspace-mobile-header hidden max-md:flex">
          <MobileBrandLink
            to="/mi-jornada"
            label="Ir a mi jornada"
            name={company?.name ?? 'Mi empresa'}
          />
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              aria-label="Menú de usuario"
              className="ml-auto h-auto rounded-full p-1"
            >
              <UserAvatar name={userName} avatarUrl={session?.avatarUrl} />
            </Button>
            {userMenu('bottom end')}
          </DropdownMenuTrigger>
        </AppShellMobileHeader>
        <div className="user-frame__search hidden md:block">
          <GlobalSearch
            mode={searchMode}
            onModeChange={setSearchMode}
            navigationOnly
            navigation={navigation.map((item) => ({
              id: `page:${item.to}`,
              title: item.label,
              category: 'Navegación',
              target: { to: item.to },
            }))}
          />
        </div>
        <AppShellContent
          id="main-content"
          size="full"
          padded={false}
          scrollable
          className="user-frame__content"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- The shared AppShellContent renders a div; name its independently scrollable region.
          role="region"
          aria-label="Contenido principal"
          tabIndex={0}
        >
          <div className="user-frame__page">
            <NavigationLayoutContext.Provider value={navigationLayout}>
              {children}
            </NavigationLayoutContext.Provider>
          </div>
        </AppShellContent>
      </AppShellMain>
      <MobileNavigation
        items={navigationLayout.mobile}
        searchOpen={searchMode === 'mobile'}
        onOpenSearch={() => setSearchMode('mobile')}
      />
      <Toaster />
    </AppShell>
  )
}
