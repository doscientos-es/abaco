import {
  Avatar,
  AvatarFallback,
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
import { useState, type CSSProperties, type ReactNode } from 'react'

import {
  can,
  CompanyDialog,
  roleLabels,
  useCompanyActions,
  useSession,
  useSignOut,
  type Permission,
} from '@/features/auth'
import { PlanBanner } from '@/features/billing'
import { GlobalSearch, type SearchItem } from '@/features/global-search'
import { platformAccessQuery } from '@/features/superadmin'
import { PendingAbsenceNotifications } from '@/features/vacations'
import { brand } from '@/shared/lib/brand'
import { retryStoreSaves, useSaveStatus, useTenantData } from '@/shared/store/store'
import { WorkspaceChromeContext } from '@/shared/ui/workspace-page-chrome'

import { initials, SidebarLink, type NavItem, type NavTo } from './frame-navigation'
import { navIcons } from './nav-icons'
import { SaveStatusIndicator, SaveStatusNotice } from './save-status-notice'

type NavGroup = { label: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    label: 'General',
    items: [{ to: '/', label: 'Resumen', icon: navIcons.home }],
  },
  {
    label: 'Ventas',
    items: [
      { to: '/presupuestos', label: 'Presupuestos', icon: navIcons.estimates },
      { to: '/contratos', label: 'Contratos', icon: navIcons.contracts },
      { to: '/clientes', label: 'Clientes', icon: navIcons.clients },
      { to: '/catalogo', label: 'Catálogo', icon: navIcons.catalog },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { to: '/trabajos', label: 'Planificación', icon: navIcons.work },
      { to: '/trabajadores', label: 'Trabajadores', icon: navIcons.clients },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { to: '/facturas', label: 'Facturas', icon: navIcons.invoices },
      { to: '/contabilidad', label: 'Contabilidad', icon: navIcons.ledger },
    ],
  },
  {
    label: 'Cuenta',
    items: [
      { to: '/personalizar', label: 'Personalizar', icon: navIcons.personalize },
      { to: '/superadmin', label: 'Administración de Ábaco', icon: navIcons.settings },
    ],
  },
]

const MAX_TABS = 5

/** Bottom bar on mobile, most used first. Ajustes lives in the user menu instead. */
const bottomOrder: NavTo[] = [
  '/',
  '/presupuestos',
  '/clientes',
  '/contratos',
  '/trabajos',
  '/trabajadores',
  '/facturas',
  '/catalogo',
  '/contabilidad',
]
const flatItems = bottomOrder.flatMap((to) =>
  navGroups.flatMap((group) => group.items).filter((item) => item.to === to),
)

/** Pages each item needs; hidden from the menu when the role lacks it. RLS still enforces it. */
const navPermission: Partial<Record<NavTo, Permission>> = {
  '/trabajadores': 'team:manage',
  '/trabajos': 'work:read',
  '/horarios': 'team:manage',
  '/contratos': 'contracts:read',
  '/vacaciones': 'vacations:manage',
  '/facturas': 'invoices:read',
  '/contabilidad': 'ledger:read',
  '/ajustes': 'settings:write',
  '/personalizar': 'settings:write',
}

function readableTextColor(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((value) => Number.parseInt(value, 16) / 255)
  if (!channels || channels.length !== 3) return '#ffffff'
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  const [red, green, blue] = linear
  if (red === undefined || green === undefined || blue === undefined) return '#ffffff'
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  return luminance > 0.42 ? '#171717' : '#ffffff'
}

export function AppFrame({ children }: { children: ReactNode }) {
  const data = useTenantData()
  const { tenant } = data
  const saveStatus = useSaveStatus()
  const session = useSession()
  const platformAccess = useQuery({
    ...platformAccessQuery(session?.userId ?? ''),
    enabled: Boolean(session?.userId),
  })
  const signOut = useSignOut()
  const navigate = useNavigate()
  const { switchTo } = useCompanyActions()
  const [creatingCompany, setCreatingCompany] = useState(false)
  const [headingTarget, setHeadingTarget] = useState<HTMLDivElement | null>(null)
  const [tabsTarget, setTabsTarget] = useState<HTMLDivElement | null>(null)
  const userName = session?.fullName || session?.email || tenant.name
  const allowed = (item: NavItem) => {
    if (item.to === '/superadmin') return platformAccess.data === true
    const needed = navPermission[item.to]
    return !needed || can(session?.role, needed)
  }
  const groups = navGroups
    .map((group) => ({ ...group, items: group.items.filter(allowed) }))
    .filter((group) => group.items.length > 0)
  const bottomItems = flatItems.filter(allowed)
  // Up to 5 sections fit as tabs; with more, the least used go under "Más".
  const tabs = bottomItems.length > MAX_TABS ? bottomItems.slice(0, MAX_TABS - 1) : bottomItems
  const moreItems = bottomItems.slice(tabs.length)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isInternalPage = pathname.split('/').filter(Boolean).length > 1
  const moreActive = moreItems.some((item) => pathname.startsWith(item.to))
  const tabClass =
    'text-muted-foreground flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-none'
  const canSeeSettings = can(session?.role, 'settings:write')
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
    <WorkspaceChromeContext.Provider value={{ heading: headingTarget, tabs: tabsTarget }}>
      <AppShell
        className="admin-frame flex h-svh flex-col overflow-hidden md:flex-row"
        style={
          tenant.brandColor && /^#[0-9a-f]{6}$/i.test(tenant.brandColor)
            ? ({
                '--primary': tenant.brandColor,
                '--primary-foreground': readableTextColor(tenant.brandColor),
                '--ring': tenant.brandColor,
              } as CSSProperties)
            : undefined
        }
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
            {groups.map((group) => (
              <div key={group.label} className="space-y-1">
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
                {can(session?.role, 'vacations:manage') && session?.tenantId ? (
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
                <Avatar>
                  <AvatarFallback>{initials(userName)}</AvatarFallback>
                </Avatar>
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

        <AppShellMain className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <AppShellMobileHeader className="hidden max-md:flex">
            <Link to="/" className="min-w-0 flex-1 leading-tight" aria-label="Ir al resumen">
              {tenant.logoUrl ? (
                <img
                  src={tenant.logoUrl}
                  alt={tenant.name}
                  className="mr-2 inline-block max-h-7 max-w-10 object-contain align-middle"
                />
              ) : null}
              <span className="block truncate text-sm font-semibold tracking-tight">
                {tenant.name}
              </span>
            </Link>
            <SaveStatusIndicator status={saveStatus} />
            <DropdownMenuTrigger>
              <Button
                variant="ghost"
                aria-label="Menú de usuario"
                className="h-auto rounded-full p-1"
              >
                <Avatar>
                  <AvatarFallback>{initials(userName)}</AvatarFallback>
                </Avatar>
              </Button>
              {userMenu('bottom end')}
            </DropdownMenuTrigger>
          </AppShellMobileHeader>
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
                key={session?.tenantId}
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
            {children}
          </AppShellContent>
        </AppShellMain>

        <nav
          aria-label="Principal"
          style={{
            gridTemplateColumns: `repeat(${tabs.length + (moreItems.length > 0 ? 1 : 0)}, minmax(0, 1fr))`,
          }}
          className="bg-sidebar border-border hidden shrink-0 border-t pb-[env(safe-area-inset-bottom)] max-md:grid"
        >
          {tabs.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === '/' }}
              activeProps={{ className: 'text-primary font-medium' }}
              className={tabClass}
            >
              {item.icon}
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          ))}
          {moreItems.length > 0 ? (
            <DropdownMenuTrigger>
              <Button
                variant="ghost"
                aria-label="Más secciones"
                className={`${tabClass} h-auto rounded-none ${moreActive ? 'text-primary font-medium' : ''}`}
              >
                {navIcons.more}
                <span>Más</span>
              </Button>
              <DropdownMenuContent placement="top end">
                {moreItems.map((item) => (
                  <DropdownMenuItem key={item.to} onAction={() => void navigate({ to: item.to })}>
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenuTrigger>
          ) : null}
        </nav>
        <CompanyDialog open={creatingCompany} onClose={() => setCreatingCompany(false)} />
      </AppShell>
    </WorkspaceChromeContext.Provider>
  )
}
