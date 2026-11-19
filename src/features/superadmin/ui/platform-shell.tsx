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
  ArrowUpRight,
  Package,
  Receipt,
  ShieldCheck,
  Wallet,
} from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, type ReactNode } from 'react'

import type { AuthSession } from '@/features/auth'

import {
  companySectionSearch,
  directorySearch,
  invoiceNavigation,
  platformLocationKey,
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
  const section = search.seccion ?? 'suscripcion'
  return (
    <ul className="border-border grid grid-cols-3 gap-1 border-b sm:flex sm:gap-5">
      {sections.map(({ id, label, icon: Icon }) => (
        <li key={id} className="min-w-0">
          <Link
            to="/superadmin"
            search={companySectionSearch(search, id)}
            activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
            data-current={id === section}
            aria-current={id === section ? 'page' : undefined}
            className="text-muted-foreground hover:text-foreground focus-visible:outline-ring data-[current=true]:border-primary data-[current=true]:text-primary -mb-px flex min-h-11 items-center justify-center gap-2 border-b-2 border-transparent px-1 pb-2 text-xs font-medium focus-visible:outline-2 sm:px-1.5 sm:text-sm"
          >
            <Icon aria-hidden="true" className="hidden size-4 shrink-0 min-[380px]:block" />
            {label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ReturnToWorkspace({
  session,
  compact = false,
}: {
  session: AuthSession | null
  compact?: boolean
}) {
  const company = session?.companies.find((item) => item.id === session.tenantId)
  const label = `Volver a ${company?.name ?? 'la aplicación'}`
  return (
    <Link
      to={session?.role === 'user' ? '/mi-jornada' : '/'}
      activeOptions={{ exact: true }}
      className={
        compact
          ? `${navLink} min-w-0`
          : 'group border-border bg-card hover:bg-muted focus-visible:outline-ring flex min-w-0 items-center gap-3 rounded-xl border p-3 text-sm focus-visible:outline-2'
      }
      aria-label={label}
      title={label}
    >
      {compact ? (
        <>
          <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </>
      ) : (
        <>
          <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
            <Buildings aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Espacio de trabajo</span>
            <span className="text-muted-foreground block truncate text-xs">
              {company?.name ?? 'Volver a la aplicación'}
            </span>
          </span>
          <ArrowUpRight aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        </>
      )}
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
  const location = platformLocationKey(search)
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
      <AppShellSidebar className="bg-card sticky top-0 hidden h-dvh w-60 shrink-0 flex-col md:flex lg:w-64">
        <AppShellSidebarHeader className="border-b-0 px-5 pt-6 pb-4">
          <PlatformBrand />
        </AppShellSidebarHeader>
        <AppShellSidebarContent className="px-3 py-4" aria-label="Navegación de plataforma">
          <PlatformNavigation search={search} />
        </AppShellSidebarContent>
        <AppShellSidebarFooter className="bg-muted/35 space-y-3 px-3 pt-3 pb-4">
          <ReturnToWorkspace session={session} />
          {session?.email ? (
            <p className="text-muted-foreground truncate px-1 text-xs" title={session.email}>
              {session.email}
            </p>
          ) : null}
        </AppShellSidebarFooter>
      </AppShellSidebar>
      <div className="bg-canvas min-w-0 flex-1">
        <AppShellMobileHeader className="sticky top-0 z-10 flex flex-col items-stretch gap-1 md:hidden">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <PlatformBrand compact />
            <ReturnToWorkspace session={session} compact />
          </div>
          <nav aria-label="Navegación de plataforma">
            <PlatformNavigation search={search} mobile />
          </nav>
        </AppShellMobileHeader>
        <AppShellMain
          ref={main}
          id="platform-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl scroll-mt-36 bg-transparent px-4 py-5 sm:px-6 md:scroll-mt-0 lg:px-10 lg:py-8"
        >
          {children}
        </AppShellMain>
      </div>
    </AppShell>
  )
}

function PlatformBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <span
        className={`bg-primary text-primary-foreground grid shrink-0 place-items-center rounded-xl ${compact ? 'size-8' : 'size-11'}`}
      >
        <ShieldCheck
          aria-hidden="true"
          className={compact ? 'size-4' : 'size-6'}
          weight="duotone"
        />
      </span>
      <div>
        <p className="text-foreground font-semibold tracking-tight">Ábaco</p>
        <p className="text-muted-foreground text-xs">Superadmin</p>
      </div>
    </div>
  )
}

const platformSections = [
  { id: undefined, label: 'Empresas', group: 'Gestión', icon: Buildings },
  { id: 'facturas', label: 'Facturas', group: 'Facturación', icon: Receipt },
  { id: 'planes', label: 'Planes y precios', icon: Wallet },
] as const

function PlatformNavigation({ search, mobile }: { search: PlatformSearch; mobile?: boolean }) {
  return (
    <ul className={mobile ? 'grid grid-cols-[1fr_1fr_1.3fr] gap-1' : 'space-y-1'}>
      {platformSections.map(({ id, label, icon: Icon, ...item }) => (
        <li key={label} className="min-w-0">
          {!mobile && 'group' in item ? (
            <p className="text-muted-foreground px-3 pt-2 pb-1 text-xs font-semibold">
              {item.group}
            </p>
          ) : null}
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
            aria-current={
              search.vista === id
                ? search.empresa || search.plan || search.referencia
                  ? 'location'
                  : 'page'
                : undefined
            }
            data-current={search.empresa ? id === undefined : search.vista === id}
            className={
              mobile
                ? `${navLink} flex-col justify-center gap-1 px-1 py-2 text-center text-xs`
                : `${navLink} before:bg-primary relative gap-3 rounded-lg before:absolute before:inset-y-2.5 before:left-0 before:hidden before:w-0.5 before:rounded-full data-[current=true]:before:block`
            }
          >
            <Icon aria-hidden="true" className="size-[1.125rem] shrink-0" weight="duotone" />
            <span>{label}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
