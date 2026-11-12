import {
  AppShell,
  AppShellContent,
  AppShellMain,
  AppShellMobileHeader,
  AppShellSidebar,
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Toaster,
} from '@doscientos/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { roleLabels, useSession, useSignOut } from '@/features/auth'
import { brand } from '@/shared/lib/brand'

import { initials, SidebarLink, type NavItem } from './frame-navigation'
import { navIcons } from './nav-icons'

import './technician-frame.css'

const navigation: NavItem[] = [
  { to: '/mi-jornada', label: 'Mi jornada', icon: navIcons.home },
  { to: '/horarios', label: 'Mi horario', icon: navIcons.visits },
  { to: '/mis-vacaciones', label: 'Mis vacaciones', icon: navIcons.visits },
  { to: '/ajustes', label: 'Ajustes', icon: navIcons.settings },
]

/** User pages never hydrate the office store or expose its financial data. */
export function UserFrame({ children }: { children: ReactNode }) {
  const session = useSession()
  const signOut = useSignOut()
  const navigate = useNavigate()
  const company = session?.companies.find((item) => item.id === session.tenantId)
  const userName = session?.fullName || session?.email || 'Usuario'
  const userMenu = (placement: 'top start' | 'bottom end') => (
    <DropdownMenuContent placement={placement}>
      <DropdownMenuLabel>{session?.email ?? ''}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onAction={() => void navigate({ to: '/ajustes' })}>
        Ajustes y empresas
      </DropdownMenuItem>
      <DropdownMenuItem onAction={() => void navigate({ to: '/nueva-contrasena' })}>
        Cambiar contraseña
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onAction={() => void signOut()}>Cerrar sesión</DropdownMenuItem>
    </DropdownMenuContent>
  )

  return (
    <AppShell className="user-frame">
      <AppShellSidebar className="hidden h-full w-64 shrink-0 flex-col md:flex">
        <div className="shrink-0 px-3 pt-4 pb-3">
          <Link
            to="/mi-jornada"
            aria-label="Ir a mi jornada"
            className="hover:bg-muted/70 flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 transition-colors"
          >
            <span className="bg-card border-border flex h-10 w-12 shrink-0 items-center justify-center">
              <img src="/abaco-logo-short.svg" alt={brand.name} className="h-5 w-auto" />
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
          <p className="text-muted-foreground/80 px-3 pb-1 text-[11px] font-medium tracking-wider uppercase">
            Mi espacio
          </p>
          {navigation.map((item) => (
            <SidebarLink key={item.to} {...item} />
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
      <AppShellMain className="user-frame__main">
        <AppShellMobileHeader className="hidden max-md:flex">
          <Link to="/mi-jornada" className="min-w-0 leading-tight" aria-label="Ir a mi jornada">
            <span className="block truncate text-sm font-semibold tracking-tight">
              {company?.name ?? 'Mi empresa'}
            </span>
          </Link>
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              aria-label="Menú de usuario"
              className="ml-auto h-auto rounded-full p-1"
            >
              <Avatar>
                <AvatarFallback>{initials(userName)}</AvatarFallback>
              </Avatar>
            </Button>
            {userMenu('bottom end')}
          </DropdownMenuTrigger>
        </AppShellMobileHeader>
        <AppShellContent
          size="full"
          padded={false}
          scrollable
          className="user-frame__content"
          role="region"
          aria-label="Contenido principal"
          tabIndex={0}
        >
          <div className="user-frame__page">{children}</div>
        </AppShellContent>
      </AppShellMain>
      <nav
        aria-label="Navegación de usuario"
        className="bg-sidebar border-border hidden shrink-0 grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] max-md:grid"
      >
        {navigation.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeProps={{ className: 'text-primary font-medium' }}
            className="text-muted-foreground flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-none"
          >
            {item.icon}
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        ))}
      </nav>
      <Toaster />
    </AppShell>
  )
}
