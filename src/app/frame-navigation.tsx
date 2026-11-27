import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { brand } from '@/shared/lib/brand'

export type NavTo =
  | '/'
  | '/presupuestos'
  | '/clientes'
  | '/trabajos'
  | '/trabajadores'
  | '/contratos'
  | '/vacaciones'
  | '/catalogo'
  | '/proveedores'
  | '/facturas'
  | '/contabilidad'
  | '/ajustes'
  | '/personalizar'
  | '/superadmin'
  | '/mi-jornada'
  | '/mis-vacaciones'
  | '/horarios'

export type NavItem = { to: NavTo; label: string; icon: ReactNode; mobileLabel?: string }

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
      activeProps={{ className: 'sidebar-link--active' }}
      className="sidebar-link text-muted-foreground flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"
    >
      {icon}
      {label}
    </Link>
  )
}

export function MobileBrandLink({
  to,
  label,
  name,
  logoUrl,
}: {
  to: NavTo
  label: string
  name: string
  logoUrl?: string | undefined
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 leading-tight"
    >
      <img src={logoUrl || brand.mark} alt="" className="h-7 w-9 shrink-0 object-contain" />
      <span className="truncate text-sm font-semibold tracking-tight">{name}</span>
    </Link>
  )
}
