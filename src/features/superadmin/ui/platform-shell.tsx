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
  Receipt,
  ShieldCheck,
  Wallet,
} from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, type ReactNode } from 'react'

import type { AuthSession } from '@/features/auth'

import {
  directorySearch,
  invoiceNavigation,
  type PlatformSearch,
} from '../domain/platform-navigation'

const navLink =
  'flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[current=true]:bg-primary/10 data-[current=true]:font-semibold data-[current=true]:text-primary'

const sections = [
  { id: 'suscripcion', label: 'Suscripción', icon: Wallet },
  { id: 'modulos', label: 'Módulos', icon: Package },
  { id: 'pagos', label: 'Pagos', icon: CreditCard },
] as const

export function CompanyNavigation({ search }: { search: PlatformSearch }) {
  const { seccion: section = 'suscripcion', ...companySearch } = search
  return (
    <ul className="border-border bg-card grid grid-cols-3 gap-1 rounded-lg border p-1 sm:flex">
      {sections.map(({ id, label, icon: Icon }) => (
        <li key={id} className="min-w-0">
          <Link
            to="/superadmin"
            search={{ ...companySearch, ...(id !== 'suscripcion' && { seccion: id }) }}
            activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
            data-current={id === section}
            aria-current={id === section ? 'page' : undefined}
            className={`${navLink} justify-center px-1 text-xs sm:px-4 sm:text-sm`}
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
      className={`${navLink} min-w-0`}
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
  const main = useRef<HTMLElement>(null)
  const location = search.empresa
    ? `${search.empresa}:${search.seccion ?? 'suscripcion'}`
    : (search.vista ?? 'empresas')
  const previousLocation = useRef(location)
  useEffect(() => {
    if (previousLocation.current === location) return
    previousLocation.current = location
    main.current?.focus({ preventScroll: true })
  }, [location])

  return (
    <AppShell className="flex min-h-dvh">
      <a href="#platform-content" className="skip-link">
        Saltar al contenido
      </a>
      <AppShellSidebar className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col md:flex">
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
          <PlatformNavigation search={search} />
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
        <AppShellMobileHeader className="sticky top-0 z-10 flex flex-col items-stretch gap-1 md:hidden">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="flex shrink-0 items-center gap-2 font-semibold">
              <ShieldCheck aria-hidden="true" className="text-primary size-5" />{' '}
              <span>
                Ábaco <span className="text-muted-foreground block text-xs">Superadmin</span>
              </span>
            </span>
            <ReturnToWorkspace session={session} />
          </div>
          <nav aria-label="Navegación de plataforma">
            <PlatformNavigation search={search} mobile />
          </nav>
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

const platformSections = [
  { id: undefined, label: 'Empresas', description: 'Suscripciones y módulos', icon: Buildings },
  { id: 'facturas', label: 'Facturas', description: 'Emisión y estado del envío', icon: Receipt },
  { id: 'planes', label: 'Planes y precios', description: 'Catálogo de Ábaco', icon: Wallet },
] as const

function PlatformNavigation({ search, mobile }: { search: PlatformSearch; mobile?: boolean }) {
  return (
    <ul className={mobile ? 'grid grid-cols-[1fr_1fr_1.3fr] gap-1' : 'space-y-1'}>
      {platformSections.map(({ id, label, description, icon: Icon }) => (
        <li key={label} className="min-w-0">
          <Link
            to="/superadmin"
            search={
              id === 'facturas'
                ? invoiceNavigation(search)
                : id
                  ? { vista: id }
                  : directorySearch(search)
            }
            activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
            aria-current={search.vista === id && !search.empresa ? 'page' : undefined}
            data-current={search.empresa ? id === undefined : search.vista === id}
            className={
              mobile
                ? `${navLink} flex-col justify-center gap-1 px-1 py-2 text-center text-xs`
                : `${navLink} py-2.5`
            }
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span>
              {label}
              {!mobile ? (
                <span className="text-muted-foreground block text-xs font-normal">
                  {description}
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
