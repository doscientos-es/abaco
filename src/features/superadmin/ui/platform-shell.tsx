import {
  AppShell,
  AppShellMain,
  AppShellMobileHeader,
  AppShellSidebar,
  AppShellSidebarContent,
  AppShellSidebarFooter,
  AppShellSidebarHeader,
} from '@doscientos/ui'
import {
  ArrowLeft,
  Buildings,
  CreditCard,
  Package,
  ShieldCheck,
  Wallet,
} from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, type ReactNode } from 'react'

import type { AuthSession } from '@/features/auth'

import { directorySearch, type PlatformSearch } from '../domain/platform-navigation'

const navLink =
  'flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[current=true]:bg-primary/10 data-[current=true]:text-primary'

const sections = [
  { id: 'suscripcion', label: 'Suscripción', icon: Wallet },
  { id: 'modulos', label: 'Módulos', icon: Package },
  { id: 'pagos', label: 'Pagos', icon: CreditCard },
] as const

export function CompanyNavigation({
  search,
  layout,
}: {
  search: PlatformSearch
  layout: 'sidebar' | 'mobile'
}) {
  const { seccion: section = 'suscripcion', ...companySearch } = search
  return (
    <ul
      className={
        layout === 'sidebar'
          ? 'space-y-1'
          : 'border-border bg-card grid grid-cols-3 gap-1 rounded-lg border p-1'
      }
    >
      {sections.map(({ id, label, icon: Icon }) => (
        <li key={id} className="min-w-0">
          <Link
            to="/superadmin"
            search={{ ...companySearch, ...(id !== 'suscripcion' && { seccion: id }) }}
            activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
            data-current={id === section}
            aria-current={id === section ? 'page' : undefined}
            className={layout === 'sidebar' ? navLink : `${navLink} justify-center px-1`}
          >
            <Icon aria-hidden="true" className="hidden size-4 shrink-0 min-[380px]:block" />
            {label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ReturnToWorkspace({ session }: { session: AuthSession | null }) {
  const company = session?.companies.find((item) => item.id === session.tenantId)
  const label = `Volver a ${company?.name ?? 'la aplicación'}`
  return (
    <Link
      to={session?.role === 'user' ? '/mi-jornada' : '/'}
      activeOptions={{ exact: true }}
      className={navLink}
      title={label}
    >
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

export function PlatformShell({
  session,
  search,
  children,
}: {
  session: AuthSession | null
  search: PlatformSearch
  children: ReactNode
}) {
  const listSearch = directorySearch(search)
  const main = useRef<HTMLElement>(null)
  const previousCompany = useRef(search.empresa)
  useEffect(() => {
    if (previousCompany.current === search.empresa) return
    previousCompany.current = search.empresa
    main.current?.focus({ preventScroll: true })
  }, [search.empresa])

  return (
    <AppShell className="flex min-h-dvh">
      <a href="#platform-content" className="skip-link">
        Saltar al contenido
      </a>
      <AppShellSidebar className="sticky top-0 hidden h-dvh w-60 flex-col md:flex">
        <AppShellSidebarHeader>
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold tracking-tight">Ábaco</p>
              <p className="text-muted-foreground text-xs">Administración de plataforma</p>
            </div>
          </div>
        </AppShellSidebarHeader>
        <AppShellSidebarContent aria-label="Navegación de plataforma">
          <p className="text-muted-foreground px-3 pb-2 text-xs font-semibold">Plataforma</p>
          <Link
            to="/superadmin"
            search={listSearch}
            activeOptions={{ exact: true, includeSearch: true }}
            data-current={!search.empresa}
            className={navLink}
          >
            <Buildings aria-hidden="true" className="size-4" /> Empresas
          </Link>
          {search.empresa ? (
            <div className="border-border mt-5 border-t pt-4">
              <p className="text-muted-foreground px-3 pb-2 text-xs font-semibold">
                Ficha de empresa
              </p>
              <CompanyNavigation search={search} layout="sidebar" />
            </div>
          ) : null}
        </AppShellSidebarContent>
        <AppShellSidebarFooter>
          {session?.email ? (
            <p className="text-muted-foreground truncate px-3 text-xs" title={session.email}>
              {session.email}
            </p>
          ) : null}
          <ReturnToWorkspace session={session} />
        </AppShellSidebarFooter>
      </AppShellSidebar>
      <div className="bg-canvas min-w-0 flex-1">
        <AppShellMobileHeader className="sticky top-0 z-10 flex justify-between md:hidden">
          <Link
            to="/superadmin"
            search={listSearch}
            activeOptions={{ exact: true, includeSearch: true }}
            className="focus-visible:outline-ring flex min-h-11 shrink-0 items-center gap-2 rounded-md font-semibold focus-visible:outline-2"
          >
            <ShieldCheck aria-hidden="true" className="text-primary size-5" /> Empresas
          </Link>
          <div className="min-w-0">
            <ReturnToWorkspace session={session} />
          </div>
        </AppShellMobileHeader>
        <AppShellMain
          ref={main}
          id="platform-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl bg-transparent px-4 py-5 sm:px-6 lg:px-10 lg:py-8"
        >
          {children}
        </AppShellMain>
      </div>
    </AppShell>
  )
}
