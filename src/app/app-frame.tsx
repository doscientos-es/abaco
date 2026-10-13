import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  AppShell,
  AppShellContent,
  AppShellMain,
  AppShellMobileHeader,
  AppShellSidebar,
} from '@doscientos/ui'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

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
      { to: '/facturas', label: 'Facturas', icon: navIcons.ledger },
      { to: '/contabilidad', label: 'Contabilidad', icon: navIcons.ledger },
    ],
  },
  {
    label: 'Cuenta',
    items: [{ to: '/ajustes', label: 'Ajustes', icon: navIcons.settings }],
  },
]

/** Bottom bar on mobile; Ajustes lives in the mobile header instead to keep 6 columns. */
const flatItems = navGroups.flatMap((group) => group.items).filter((item) => item.to !== '/ajustes')

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

  return (
    <AppShell className="flex h-svh flex-col overflow-hidden md:flex-row">
      <AppShellSidebar className="hidden h-full w-64 shrink-0 flex-col md:flex">
        <div className="flex shrink-0 flex-col gap-4 px-5 py-6">
          <Link to="/" className="min-w-0 leading-tight" aria-label="Ir al resumen">
            <span className="block truncate text-sm font-semibold tracking-tight">
              {tenant.name}
            </span>
            <span className="text-muted-foreground block text-xs">Presupuestos y obra</span>
          </Link>
        </div>

        <nav aria-label="Principal" className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-1">
          {navGroups.map((group) => (
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
                <AvatarFallback>{initials(tenant.name)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 text-left leading-tight">
                <span className="block truncate text-sm font-medium">{tenant.name}</span>
                <span className="text-muted-foreground block truncate text-xs font-normal">
                  {tenant.email}
                </span>
              </span>
            </Button>
            <DropdownMenuContent placement="top start">
              <DropdownMenuLabel>
                {tenant.taxId} · {tenant.phone}
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenuTrigger>
        </div>
      </AppShellSidebar>

      <AppShellMain className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <AppShellMobileHeader className="hidden max-md:flex">
          <Link to="/" className="min-w-0 leading-tight" aria-label="Ir al resumen">
            <span className="block truncate text-sm font-semibold tracking-tight">{tenant.name}</span>
          </Link>
          <Link to="/ajustes" aria-label="Ajustes" className="text-muted-foreground ml-auto">
            {navIcons.settings}
          </Link>
        </AppShellMobileHeader>
        <AppShellContent className="mx-auto max-w-6xl p-4 sm:px-10 sm:py-10">{children}</AppShellContent>
      </AppShellMain>

      <nav
        aria-label="Principal"
        className="bg-sidebar border-border hidden shrink-0 grid-cols-6 border-t pb-[env(safe-area-inset-bottom)] max-md:grid"
      >
        {flatItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === '/' }}
            activeProps={{ className: 'text-primary font-medium' }}
            className="text-muted-foreground flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-none"
          >
            {item.icon}
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        ))}
      </nav>
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
