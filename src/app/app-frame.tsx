import {
  Avatar,
  AvatarFallback,
  Button,
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
} from '@doscientos/ui'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

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
import { brand } from '@/shared/lib/brand'
import { useTenantData } from '@/shared/store/store'

import { navIcons } from './nav-icons'

type NavTo = '/' | '/presupuestos' | '/clientes' | '/catalogo' | '/facturas' | '/contabilidad' | '/ajustes'
type NavItem = { to: NavTo; label: string; icon: ReactNode }
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
      { to: '/clientes', label: 'Clientes', icon: navIcons.clients },
      { to: '/catalogo', label: 'Catálogo', icon: navIcons.catalog },
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
    items: [{ to: '/ajustes', label: 'Ajustes', icon: navIcons.settings }],
  },
]

const MAX_TABS = 5

/** Bottom bar on mobile, most used first. Ajustes lives in the user menu instead. */
const bottomOrder: NavTo[] = ['/', '/presupuestos', '/clientes', '/facturas', '/catalogo', '/contabilidad']
const flatItems = bottomOrder.flatMap((to) => navGroups.flatMap((group) => group.items).filter((item) => item.to === to))

/** Pages each item needs; hidden from the menu when the role lacks it. RLS still enforces it. */
const navPermission: Partial<Record<NavTo, Permission>> = {
  '/facturas': 'invoices:read',
  '/contabilidad': 'ledger:read',
  '/ajustes': 'settings:write',
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join('') || '?'
  )
}

export function AppFrame({ children }: { children: ReactNode }) {
  const { tenant } = useTenantData()
  const session = useSession()
  const signOut = useSignOut()
  const navigate = useNavigate()
  const { switchTo } = useCompanyActions()
  const [creatingCompany, setCreatingCompany] = useState(false)
  const userName = session?.fullName || session?.email || tenant.name
  const allowed = (item: NavItem) => {
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
  const moreActive = moreItems.some((item) => pathname.startsWith(item.to))
  const tabClass =
    'text-muted-foreground flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-none'
  const canSeeSettings = can(session?.role, 'settings:write')

  /** Same menu in the sidebar footer (desktop) and the mobile header. */
  const userMenu = (placement: 'top start' | 'bottom end') => (
    <DropdownMenuContent placement={placement}>
      <DropdownMenuLabel>{session?.email ?? ''}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {(session?.companies ?? []).map((company) => (
        <DropdownMenuItem
          key={company.id}
          onAction={() => {
            if (company.id !== session?.tenantId) void switchTo(company.id)
          }}
        >
          {company.id === session?.tenantId ? '✓ ' : ''}
          {company.name}
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem onAction={() => setCreatingCompany(true)}>Nueva empresa…</DropdownMenuItem>
      <DropdownMenuSeparator />
      {canSeeSettings ? (
        <DropdownMenuItem onAction={() => void navigate({ to: '/ajustes' })}>Ajustes y equipo</DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onAction={() => void navigate({ to: '/nueva-contrasena' })}>
        Cambiar contraseña
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onAction={() => void signOut()}>Cerrar sesión</DropdownMenuItem>
    </DropdownMenuContent>
  )

  return (
    <AppShell className="flex h-svh flex-col overflow-hidden md:flex-row">
      <AppShellSidebar className="hidden h-full w-64 shrink-0 flex-col md:flex">
        <div className="shrink-0 px-3 pt-4 pb-3">
          <Link
            to="/"
            aria-label="Ir al resumen"
            className="hover:bg-muted/70 flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 transition-colors"
          >
            <span className="bg-card border-border flex h-10 w-12 shrink-0 items-center justify-center">
              <img src="/abaco-logo-short.svg" alt={brand.name} className="h-5 w-auto" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight">{tenant.name}</span>
              <span className="text-muted-foreground block truncate text-xs">{brand.name}</span>
            </span>
          </Link>
        </div>

        <nav aria-label="Principal" className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-1">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="text-muted-foreground/80 px-3 pb-1 text-[11px] font-medium tracking-wider uppercase">
                {group.label}
              </p>
              {group.items.map((item) => (
                <SidebarLink key={item.to} {...item} />
              ))}
            </div>
          ))}
        </nav>

        <div className="border-border mt-auto shrink-0 border-t p-3">
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
          <Link to="/" className="min-w-0 leading-tight" aria-label="Ir al resumen">
            <span className="block truncate text-sm font-semibold tracking-tight">{tenant.name}</span>
          </Link>
          <DropdownMenuTrigger>
            <Button variant="ghost" aria-label="Menú de usuario" className="ml-auto h-auto rounded-full p-1">
              <Avatar>
                <AvatarFallback>{initials(userName)}</AvatarFallback>
              </Avatar>
            </Button>
            {userMenu('bottom end')}
          </DropdownMenuTrigger>
        </AppShellMobileHeader>
        <PlanBanner />
        <AppShellContent className="mx-auto max-w-6xl p-4 sm:px-10 sm:py-10">{children}</AppShellContent>
      </AppShellMain>

      <nav
        aria-label="Principal"
        style={{ gridTemplateColumns: `repeat(${tabs.length + (moreItems.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}
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
  )
}

function SidebarLink({ to, label, icon }: NavItem) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === '/' }}
      activeProps={{
        className: 'bg-accent text-accent-foreground font-medium',
      }}
      className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors"
    >
      {icon}
      {label}
    </Link>
  )
}
