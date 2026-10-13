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
import { Link, useNavigate } from '@tanstack/react-router'
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
  const userName = session?.demo ? tenant.name : session?.fullName || session?.email || tenant.name
  const allowed = (item: NavItem) => {
    const needed = navPermission[item.to]
    return !needed || can(session?.role, needed)
  }
  const groups = navGroups
    .map((group) => ({ ...group, items: group.items.filter(allowed) }))
    .filter((group) => group.items.length > 0)
  const bottomItems = flatItems.filter(allowed)
  const canSeeSettings = can(session?.role, 'settings:write')

  return (
    <AppShell className="flex h-svh flex-col overflow-hidden md:flex-row">
      <AppShellSidebar className="hidden h-full w-64 shrink-0 flex-col md:flex">
        <div className="flex shrink-0 flex-col gap-4 px-5 py-6">
          <Link to="/" className="min-w-0 leading-tight" aria-label="Ir al resumen">
            <span className="block truncate text-sm font-semibold tracking-tight">
              {tenant.name}
            </span>
            <span className="text-muted-foreground block text-xs">
              {brand.name} · {brand.byline.toLowerCase()}
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
                  {session?.demo ? tenant.email : session?.role ? roleLabels[session.role] : ''}
                </span>
              </span>
            </Button>
            <DropdownMenuContent placement="top start">
              <DropdownMenuLabel>
                {session?.demo ? 'Modo demo' : (session?.email ?? '')}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {session?.demo
                ? null
                : (
                  <>
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
                    <DropdownMenuItem onAction={() => setCreatingCompany(true)}>
                      Nueva empresa…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
              {canSeeSettings ? (
                <DropdownMenuItem onAction={() => void navigate({ to: '/ajustes' })}>
                  Ajustes y equipo
                </DropdownMenuItem>
              ) : null}
              {session?.demo ? null : (
                <>
                  <DropdownMenuItem onAction={() => void navigate({ to: '/nueva-contrasena' })}>
                    Cambiar contraseña
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onAction={() => void signOut()}>Cerrar sesión</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenuTrigger>
        </div>
      </AppShellSidebar>

      <AppShellMain className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <AppShellMobileHeader className="hidden max-md:flex">
          <Link to="/" className="min-w-0 leading-tight" aria-label="Ir al resumen">
            <span className="block truncate text-sm font-semibold tracking-tight">{tenant.name}</span>
          </Link>
          {canSeeSettings ? (
            <Link to="/ajustes" aria-label="Ajustes" className="text-muted-foreground ml-auto">
              {navIcons.settings}
            </Link>
          ) : null}
          {session?.demo ? null : (
            <Button variant="ghost" size="sm" className={canSeeSettings ? '' : 'ml-auto'} onPress={() => void signOut()}>
              Salir
            </Button>
          )}
        </AppShellMobileHeader>
        <PlanBanner />
        <AppShellContent className="mx-auto max-w-6xl p-4 sm:px-10 sm:py-10">{children}</AppShellContent>
      </AppShellMain>

      <nav
        aria-label="Principal"
        style={{ gridTemplateColumns: `repeat(${bottomItems.length}, minmax(0, 1fr))` }}
        className="bg-sidebar border-border hidden shrink-0 border-t pb-[env(safe-area-inset-bottom)] max-md:grid"
      >
        {bottomItems.map((item) => (
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
