import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export type NavTo =
  | '/'
  | '/presupuestos'
  | '/clientes'
  | '/trabajos'
  | '/contratos'
  | '/vacaciones'
  | '/catalogo'
  | '/facturas'
  | '/contabilidad'
  | '/ajustes'
  | '/personalizar'
  | '/superadmin'
  | '/mi-jornada'
  | '/mis-vacaciones'
  | '/horarios'

export type NavItem = { to: NavTo; label: string; icon: ReactNode }

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join('') || '?'
  )
}

export function SidebarLink({ to, label, icon }: NavItem) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === '/' }}
      activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
      className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors"
    >
      {icon}
      {label}
    </Link>
  )
}
