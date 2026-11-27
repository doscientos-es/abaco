import {
  AppShell,
  AppShellContent,
  AppShellMain,
  AppShellMobileHeader,
  AppShellSidebar,
  AppShellSidebarContent,
  AppShellSidebarFooter,
  AppShellSidebarHeader,
  buttonVariants,
  cn,
} from '@doscientos/ui'
import {
  ArrowLeft,
  Buildings,
  ChartBar,
  CreditCard,
  IdentificationCard,
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

const sections = [
  { id: 'suscripcion', label: 'Suscripción', icon: Wallet },
  { id: 'datos', label: 'Datos', icon: IdentificationCard },
  { id: 'modulos', label: 'Módulos', icon: Package },
  { id: 'pagos', label: 'Pagos', icon: CreditCard },
] as const

export function CompanyNavigation({ search }: { search: PlatformSearch }) {
  const section = search.seccion ?? 'suscripcion'
  return (
    <ul className="border-border flex flex-wrap gap-1 border-b pb-2">
      {sections.map(({ id, label, icon: Icon }) => (
        <li key={id} className="min-w-0">
          <Link
            to="/superadmin"
            search={companySectionSearch(search, id)}
            activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
            data-current={id === section}
            aria-current={id === section ? 'page' : undefined}
            className={buttonVariants({
              variant: id === section ? 'secondary' : 'ghost',
              size: 'sm',
            })}
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
      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'min-w-0 justify-start')}
      aria-label={label}
      title={label}
    >
      <ArrowLeft aria-hidden="true" />
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
  const content = useRef<HTMLDivElement>(null)
  const location = platformLocationKey(search)
  const previousLocation = useRef(location)
  useEffect(() => {
    if (previousLocation.current === location) return
    previousLocation.current = location
    if (content.current) content.current.scrollTop = 0
    main.current?.focus({ preventScroll: true })
  }, [location])

  return (
    <AppShell className="h-dvh">
      <a href="#platform-content" className="skip-link">
        Saltar al contenido
      </a>
      <AppShellSidebar width="compact">
        <AppShellSidebarHeader className="px-3 py-4">
          <PlatformBrand />
        </AppShellSidebarHeader>
        <AppShellSidebarContent className="px-2" aria-label="Navegación de plataforma">
          <PlatformNavigation search={search} />
        </AppShellSidebarContent>
        <AppShellSidebarFooter className="px-2 py-2">
          <ReturnToWorkspace session={session} />
          {session?.email ? (
            <p className="text-muted-foreground truncate px-1 text-xs" title={session.email}>
              {session.email}
            </p>
          ) : null}
        </AppShellSidebarFooter>
      </AppShellSidebar>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AppShellMobileHeader className="h-auto flex-col items-stretch gap-1 py-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <PlatformBrand />
            <ReturnToWorkspace session={session} />
          </div>
          <nav aria-label="Navegación de plataforma">
            <PlatformNavigation search={search} mobile />
          </nav>
        </AppShellMobileHeader>
        <AppShellMain ref={main} id="platform-content" tabIndex={-1}>
          <AppShellContent ref={content} density="compact" size="full" padded={false}>
            <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">{children}</div>
          </AppShellContent>
        </AppShellMain>
      </div>
    </AppShell>
  )
}

function PlatformBrand() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <ShieldCheck aria-hidden="true" className="text-muted-foreground size-4" />
      <div>
        <p className="text-foreground text-sm font-semibold">Menoslios</p>
        <p className="text-muted-foreground text-xs">Plataforma</p>
      </div>
    </div>
  )
}

const platformSections = [
  { id: 'resumen', label: 'Resumen', icon: ChartBar },
  { id: undefined, label: 'Empresas', icon: Buildings },
  { id: 'facturas', label: 'Facturas', icon: Receipt },
  { id: 'planes', label: 'Planes y precios', icon: Wallet },
] as const

function PlatformNavigation({ search, mobile }: { search: PlatformSearch; mobile?: boolean }) {
  return (
    <ul className={mobile ? 'grid grid-cols-2 gap-1 min-[420px]:grid-cols-4' : 'space-y-1'}>
      {platformSections.map(({ id, label, icon: Icon }) => (
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
            aria-current={
              search.vista === id
                ? search.empresa || search.plan || search.referencia
                  ? 'location'
                  : 'page'
                : undefined
            }
            className={cn(
              buttonVariants({ variant: search.vista === id ? 'secondary' : 'ghost', size: 'sm' }),
              'w-full',
              mobile ? 'min-h-10 px-2' : 'justify-start',
            )}
          >
            <Icon aria-hidden="true" className={mobile ? 'hidden min-[380px]:block' : undefined} />
            <span>{label}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
