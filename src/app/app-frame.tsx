import {
  Button,
  IconButton,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  AppShell,
  AppShellContent,
  AppShellMain,
  AppShellMobileHeader,
  AppShellSidebar,
  toast,
} from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { AiChatProvider, type ClientProgress } from '@/features/ai'
import {
  can,
  CompanyDialog,
  roleLabels,
  useCompanyActions,
  useSession,
  useSignOut,
  UserAvatar,
  type Permission,
} from '@/features/auth'
import { PlanBanner } from '@/features/billing'
import { ClientFormDialog } from '@/features/clients'
import { GlobalSearch, type SearchItem, type SearchMode } from '@/features/global-search'
import {
  NavigationLayoutContext,
  useNavigationLayout,
  type NavigationGroup,
} from '@/features/interface-preferences'
import { ContractInvoiceNotifications } from '@/features/invoices'
import { useModuleEnabled, useStaffModule } from '@/features/product-modules'
import { platformAccessQuery } from '@/features/superadmin'
import { PendingAbsenceNotifications } from '@/features/vacations'
import { brand } from '@/shared/lib/brand'
import { retryStoreSaves, useSaveStatus, useTenantData } from '@/shared/store/store'
import { brandThemeStyle } from '@/shared/ui/brand-theme'
import { WorkspaceChromeContext } from '@/shared/ui/workspace-page-chrome'

import { MobileBrandLink, SidebarLink, type NavItem, type NavTo } from './frame-navigation'
import { MobileNavigation } from './mobile-navigation'
import { navIcons } from './nav-icons'
import { PlatformMenuSection } from './platform-menu-section'
import { MobileSaveStatus, SaveStatusIndicator, SaveStatusNotice } from './save-status-notice'

const navGroups: NavigationGroup<NavItem>[] = [
  {
    id: 'general',
    label: 'General',
    items: [
      { to: '/', label: 'Resumen', icon: navIcons.home },
      { to: '/mi-jornada', label: 'Mi jornada', icon: navIcons.myDay },
      { to: '/horarios', label: 'Mi horario', icon: navIcons.mySchedule },
      { to: '/mis-vacaciones', label: 'Mis ausencias', icon: navIcons.myAbsences },
    ],
  },
  {
    id: 'sales',
    label: 'Ventas',
    items: [
      {
        to: '/presupuestos',
        label: 'Presupuestos',
        mobileLabel: 'Presup.',
        icon: navIcons.estimates,
      },
      { to: '/contratos', label: 'Contratos', icon: navIcons.contracts },
      { to: '/clientes', label: 'Clientes', icon: navIcons.clients },
      { to: '/catalogo', label: 'Catálogo', icon: navIcons.catalog },
      { to: '/proveedores', label: 'Proveedores', icon: navIcons.clients },
    ],
  },
  {
    id: 'operations',
    label: 'Operaciones',
    items: [
      { to: '/trabajos', label: 'Planificación', mobileLabel: 'Trabajos', icon: navIcons.work },
      { to: '/trabajadores', label: 'Trabajadores', icon: navIcons.clients },
    ],
  },
  {
    id: 'finance',
    label: 'Finanzas',
    items: [
      { to: '/facturas', label: 'Facturas', icon: navIcons.invoices },
      { to: '/contabilidad', label: 'Contabilidad', icon: navIcons.ledger },
    ],
  },
  {
    id: 'account',
    label: 'Cuenta',
    items: [
      { to: '/personalizar', label: 'Personalizar', icon: navIcons.personalize },
      { to: '/superadmin', label: 'Administración de Ábaco', icon: navIcons.settings },
    ],
  },
]

/** Keep the existing shortcuts as defaults, with fallbacks for restricted accounts. */
const mobileDefaults: NavTo[] = [
  '/',
  '/presupuestos',
  '/clientes',
  '/trabajos',
  '/contratos',
  '/trabajadores',
  '/facturas',
  '/catalogo',
  '/contabilidad',
]
const settingsItem: NavItem = { to: '/ajustes', label: 'Ajustes', icon: navIcons.settings }

/** Pages each item needs; hidden from the menu when the role lacks it. RLS still enforces it. */
const navPermission: Partial<Record<NavTo, Permission>> = {
  '/trabajadores': 'team:manage',
  '/trabajos': 'work:read',
  '/horarios': 'settings:personal',
  '/mi-jornada': 'visits:assigned',
  '/mis-vacaciones': 'vacations:request',
  '/contratos': 'contracts:read',
  '/vacaciones': 'vacations:manage',
  '/facturas': 'invoices:read',
  '/contabilidad': 'ledger:read',
  '/catalogo': 'catalog:read',
  '/proveedores': 'catalog:read',
  '/ajustes': 'settings:write',
  '/personalizar': 'settings:write',
}

export function AppFrame({ children }: { children: ReactNode }) {
  const data = useTenantData()
  const session = useSession()
  const { tenant } = data
  const procurement = useModuleEnabled(tenant.id, 'procurement')
  const staff = useStaffModule(tenant.id)
  const saveStatus = useSaveStatus()
  const { data: hasPlatformAccess } = useQuery(platformAccessQuery(session?.userId ?? ''))
  const signOut = useSignOut()
  const navigate = useNavigate()
  const { switchTo } = useCompanyActions()
  const [creatingCompany, setCreatingCompany] = useState(false)
  const proposalScope = `${tenant.id}:${session?.userId ?? ''}`
  const [clientProposal, setClientProposal] = useState<
    (ClientProgress & { live: boolean; scope: string }) | null
  >(null)
  const dismissedProposals = useRef(new Set<string>())
  const [completedClientProposal, setCompletedClientProposal] = useState<{
    id: string
    scope: string
  } | null>(null)
  useEffect(() => {
    dismissedProposals.current.clear()
    setClientProposal((current) => (current?.scope === proposalScope ? current : null))
  }, [proposalScope])
  const activeProposal = clientProposal?.scope === proposalScope ? clientProposal : null
  const [searchMode, setSearchMode] = useState<SearchMode>(null)
  const [headingTarget, setHeadingTarget] = useState<HTMLDivElement | null>(null)
  const [tabsTarget, setTabsTarget] = useState<HTMLDivElement | null>(null)
  const userName = session?.fullName || session?.email || tenant.name
  const allowed = (item: NavItem) => {
    if (item.to === '/superadmin') return hasPlatformAccess === true
    if (item.to === '/proveedores' && !procurement) return false
    if (item.to === '/trabajadores' && !staff) return false
    const needed = navPermission[item.to]
    return !needed || can(session?.role, needed)
  }
  const groups = navGroups
    .map((group) => ({ ...group, items: group.items.filter(allowed) }))
    .filter((group) => group.items.length > 0)
  const canSeeSettings = allowed(settingsItem)
  const navigationLayout = useNavigationLayout({
    tenantId: tenant.id,
    userId: session?.userId ?? '',
    groups,
    choices: [
      ...groups.flatMap((group) => group.items).filter((item) => item.to !== '/superadmin'),
      ...(canSeeSettings ? [settingsItem] : []),
    ],
    mobileDefaults,
  })
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isInternalPage = pathname.split('/').filter(Boolean).length > 1
  const shortcuts: Record<string, string> = {
    '/': 'g r',
    '/presupuestos': 'g p',
    '/clientes': 'g c',
    '/trabajos': 'g t',
    '/trabajadores': 'g e',
    '/facturas': 'g f',
  }
  const searchNavigation: SearchItem[] = groups.flatMap((group) =>
    group.items.map((item) => ({
      id: `page:${item.to}`,
      title: item.label,
      category: 'Navegación',
      keywords: group.label,
      target: { to: item.to },
      ...(shortcuts[item.to] ? { shortcut: shortcuts[item.to] } : {}),
    })),
  )
  if (canSeeSettings)
    searchNavigation.push({
      id: 'page:settings',
      title: 'Ajustes',
      category: 'Navegación',
      target: { to: '/ajustes' },
    })
  if (can(session?.role, 'clients:write'))
    searchNavigation.push({
      id: 'action:client',
      title: 'Nuevo cliente',
      category: 'Acciones',
      target: { to: '/clientes/nuevo' },
    })
  const section =
    groups.find((group) =>
      group.items.some((item) =>
        item.to === '/' ? pathname === '/' : pathname.startsWith(item.to),
      ),
    )?.label ?? 'Mi espacio'

  /** Same menu in the sidebar footer (desktop) and the mobile header. */
  const userMenu = (placement: 'top start' | 'bottom end') => (
    <DropdownMenuContent placement={placement}>
      <DropdownMenuLabel>{session?.email ?? ''}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {(session?.companies ?? []).map((company) => (
        <DropdownMenuItem
          key={company.id}
          onAction={() => {
            if (company.id !== session?.tenantId) {
              void switchTo(company.id).catch(() => toast.error('No se pudo cambiar de empresa.'))
            }
          }}
        >
          {company.id === session?.tenantId ? '✓ ' : ''}
          {company.name}
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem onAction={() => setCreatingCompany(true)}>Nueva empresa…</DropdownMenuItem>
      <DropdownMenuSeparator />
      {hasPlatformAccess === true ? (
        <>
          <PlatformMenuSection onOpen={() => void navigate({ to: '/superadmin' })} />
          <DropdownMenuSeparator />
        </>
      ) : null}
      {canSeeSettings ? (
        <>
          <DropdownMenuItem onAction={() => void navigate({ to: '/personalizar' })}>
            Personalizar Ábaco
          </DropdownMenuItem>
          <DropdownMenuItem onAction={() => void navigate({ to: '/ajustes' })}>
            Ajustes
          </DropdownMenuItem>
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
    <AiChatProvider
      key={`${tenant.id}:${session?.userId ?? ''}`}
      tenantId={tenant.id}
      userId={session?.userId ?? ''}
      completedClientProposalId={
        completedClientProposal?.scope === proposalScope ? completedClientProposal.id : null
      }
      onCreateClient={(proposal, proposalId) => {
        if (can(session?.role, 'clients:write'))
          setClientProposal({
            id: proposalId,
            values: proposal,
            streaming: false,
            stop: () => {},
            live: false,
            scope: proposalScope,
          })
      }}
      onClientProgress={(progress) => {
        if (!can(session?.role, 'clients:write') || dismissedProposals.current.has(progress.id))
          return
        setClientProposal((current) =>
          current?.scope === proposalScope && current.id !== progress.id
            ? current
            : { ...progress, live: true, scope: proposalScope },
        )
      }}
    >
      <WorkspaceChromeContext.Provider value={{ heading: headingTarget, tabs: tabsTarget }}>
        <AppShell
          className="admin-frame flex h-svh flex-col overflow-hidden md:flex-row"
          style={brandThemeStyle(tenant.brandColor)}
        >
          <a href="#main-content" className="skip-link">
            Saltar al contenido
          </a>
          <AppShellSidebar className="workspace-sidebar hidden h-full w-64 shrink-0 flex-col md:flex">
            <div className="shrink-0 px-3 pt-4 pb-3">
              <Link
                to="/"
                aria-label="Ir al resumen"
                className="hover:bg-muted/70 flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 transition-colors"
              >
                <span className="bg-card border-border flex h-10 w-12 shrink-0 items-center justify-center">
                  {tenant.logoUrl ? (
                    <img
                      src={tenant.logoUrl}
                      alt={tenant.name}
                      className="max-h-8 max-w-12 object-contain"
                    />
                  ) : (
                    <img src="/abaco-logo-short.svg" alt={brand.name} className="h-5 w-auto" />
                  )}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-semibold tracking-tight">
                    {tenant.name}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">{brand.name}</span>
                </span>
              </Link>
            </div>

            <nav
              aria-label="Principal"
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-1"
            >
              {navigationLayout.desktop.map((group) => (
                <div key={group.id} className="space-y-1">
                  <p className="text-muted-foreground px-3 pt-1 pb-1 text-xs font-medium">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <SidebarLink key={item.to} {...item} />
                  ))}
                </div>
              ))}
            </nav>

            <PlanBanner placement="sidebar" />

            <div className="border-border mt-auto shrink-0 border-t p-3">
              <div className="flex items-center gap-1 px-2 pb-2">
                <SaveStatusIndicator status={saveStatus} />
                <div className="ml-auto flex items-center gap-1">
                  {can(session?.role, 'invoices:read') && session?.tenantId ? (
                    <ContractInvoiceNotifications
                      tenantId={session.tenantId}
                      userId={session.userId}
                    />
                  ) : null}
                  {staff && can(session?.role, 'vacations:manage') && session?.tenantId ? (
                    <PendingAbsenceNotifications tenantId={session.tenantId} />
                  ) : null}
                  {canSeeSettings ? (
                    <IconButton
                      label="Ajustes"
                      variant="ghost"
                      onPress={() => void navigate({ to: '/ajustes' })}
                      className={pathname === '/ajustes' ? 'text-primary' : 'text-muted-foreground'}
                    >
                      {navIcons.settings}
                    </IconButton>
                  ) : null}
                </div>
              </div>
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

          <AppShellMobileHeader className="workspace-mobile-header hidden max-md:flex">
            <MobileBrandLink
              to="/"
              label="Ir al resumen"
              name={tenant.name}
              logoUrl={tenant.logoUrl}
            />
            <MobileSaveStatus status={saveStatus} />
            {can(session?.role, 'invoices:read') && session?.tenantId ? (
              <ContractInvoiceNotifications tenantId={session.tenantId} userId={session.userId} />
            ) : null}
            <DropdownMenuTrigger>
              <Button
                variant="ghost"
                aria-label="Menú de usuario"
                className="h-auto rounded-full p-1"
              >
                <UserAvatar name={userName} avatarUrl={session?.avatarUrl} />
              </Button>
              {userMenu('bottom end')}
            </DropdownMenuTrigger>
          </AppShellMobileHeader>
          <AppShellMain className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="workspace-topbar">
              <div className="workspace-topbar__row">
                <div className="workspace-topbar__identity">
                  {isInternalPage ? (
                    <span className="text-muted-foreground hidden min-w-0 truncate text-xs md:block">
                      {tenant.name}
                      <span aria-hidden="true" className="px-2">
                        /
                      </span>
                      <span className="text-foreground">{section}</span>
                    </span>
                  ) : null}
                  <div ref={setHeadingTarget} className="workspace-topbar__heading" />
                </div>
                <GlobalSearch
                  mode={searchMode}
                  onModeChange={setSearchMode}
                  data={session?.role === 'admin' ? data : undefined}
                  navigation={searchNavigation}
                />
              </div>
              <div ref={setTabsTarget} className="workspace-topbar__tabs" />
            </div>
            <PlanBanner />
            <SaveStatusNotice status={saveStatus} onRetry={retryStoreSaves} />
            <AppShellContent
              id="main-content"
              tabIndex={-1}
              size={pathname === '/vacaciones' || pathname === '/trabajadores' ? 'full' : 'wide'}
              className={`mx-auto p-4 md:px-6 md:py-6 ${pathname === '/vacaciones' || pathname === '/trabajadores' ? 'max-w-none' : 'max-w-6xl'}`}
            >
              <NavigationLayoutContext.Provider value={navigationLayout}>
                {children}
              </NavigationLayoutContext.Provider>
            </AppShellContent>
          </AppShellMain>

          <MobileNavigation
            items={navigationLayout.mobile}
            searchOpen={searchMode === 'mobile'}
            onOpenSearch={() => setSearchMode('mobile')}
          />
          <CompanyDialog open={creatingCompany} onClose={() => setCreatingCompany(false)} />
          <ClientFormDialog
            open={activeProposal !== null}
            initialValues={
              activeProposal && !activeProposal.live
                ? {
                    name: activeProposal.values.name ?? '',
                    taxId: activeProposal.values.taxId ?? '',
                    email: activeProposal.values.email ?? '',
                    phone: activeProposal.values.phone ?? '',
                    address: activeProposal.values.address ?? '',
                  }
                : {}
            }
            assistantValues={activeProposal?.live ? activeProposal.values : undefined}
            assistantStreaming={activeProposal?.streaming ?? false}
            onStopAssistant={activeProposal?.stop}
            onClose={() => {
              if (activeProposal) {
                dismissedProposals.current.add(activeProposal.id)
                if (activeProposal.streaming) activeProposal.stop()
              }
              setClientProposal(null)
            }}
            onSaved={(clientId) => {
              if (activeProposal)
                setCompletedClientProposal({ id: activeProposal.id, scope: proposalScope })
              void navigate({ to: '/clientes/$clientId', params: { clientId } })
            }}
          />
        </AppShell>
      </WorkspaceChromeContext.Provider>
    </AiChatProvider>
  )
}
