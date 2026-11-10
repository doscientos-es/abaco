import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserFrame } from './technician-frame'

const { session, signOut, navigate, menuItem } = vi.hoisted(() => ({
  session: vi.fn(),
  signOut: vi.fn(),
  navigate: vi.fn(),
  menuItem: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string
    children: ReactNode
    [key: string]: unknown
  }) => {
    const { activeProps: _activeProps, activeOptions: _activeOptions, ...domProps } = props
    return (
      <a href={to} {...domProps}>
        {children}
      </a>
    )
  },
  useNavigate: () => navigate,
}))
vi.mock('@/features/auth', () => ({
  useSession: session,
  useSignOut: () => signOut,
  roleLabels: { user: 'Usuario', admin: 'Administrador' },
}))
vi.mock('@doscientos/ui', () => {
  const box = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
    <div {...props}>{children}</div>
  )
  return {
    AppShell: box,
    AppShellContent: ({
      children,
      size,
      padded,
      scrollable,
      ...props
    }: {
      children?: ReactNode
      size?: string
      padded?: boolean
      scrollable?: boolean
      [key: string]: unknown
    }) => (
      <div data-size={size} data-padded={padded} data-scrollable={scrollable} {...props}>
        {children}
      </div>
    ),
    AppShellMain: box,
    AppShellMobileHeader: box,
    AppShellSidebar: box,
    Avatar: box,
    AvatarFallback: box,
    Button: ({
      children,
      variant: _variant,
      ...props
    }: {
      children: ReactNode
      variant?: string
    }) => <button {...props}>{children}</button>,
    DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: menuItem,
    DropdownMenuLabel: box,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuTrigger: box,
    Toaster: () => null,
  }
})

describe('worker navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.mockReturnValue({
      fullName: 'Ana Pérez',
      email: 'ana@example.test',
      role: 'user',
      tenantId: 'one',
      companies: [{ id: 'one', name: 'Empresa Uno' }],
    })
    menuItem.mockImplementation(({ children }: { children: ReactNode }) => <span>{children}</span>)
  })

  it('shows worker-only navigation on desktop and mobile without office links', () => {
    const html = renderToStaticMarkup(
      <UserFrame>
        <p>Contenido</p>
      </UserFrame>,
    )
    expect(html).toContain('Empresa Uno')
    expect(html).toContain('Ana Pérez')
    expect(html).toContain('md:flex')
    expect(html).toContain('max-md:grid')
    expect(html).toContain('Contenido')
    for (const path of ['/mi-jornada', '/mis-vacaciones', '/ajustes']) {
      expect(html).toContain(`href="${path}"`)
    }
    for (const path of ['/clientes', '/facturas', '/trabajos', '/superadmin']) {
      expect(html).not.toContain(`href="${path}"`)
    }
    expect(html).toContain('Menú de usuario')
  })

  it('keeps the page in a dedicated keyboard-accessible content region', () => {
    const html = renderToStaticMarkup(<UserFrame>Final de la página</UserFrame>)

    expect(html).toContain('class="user-frame"')
    expect(html).toContain('class="user-frame__main"')
    expect(html).toContain('data-size="full"')
    expect(html).toContain('data-padded="false"')
    expect(html).toContain('data-scrollable="true"')
    expect(html).toContain('class="user-frame__content"')
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="Contenido principal"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('<div class="user-frame__page">Final de la página</div>')
  })

  it('opens personal settings and password change, and signs out from the menu', () => {
    renderToStaticMarkup(<UserFrame>Contenido</UserFrame>)
    const action = (label: string) => {
      const item = menuItem.mock.calls.find(([props]) => props.children === label)?.[0]
      if (!item) throw new Error(`Missing menu item: ${label}`)
      item.onAction()
    }
    action('Ajustes y empresas')
    action('Cambiar contraseña')
    action('Cerrar sesión')
    expect(navigate).toHaveBeenCalledWith({ to: '/ajustes' })
    expect(navigate).toHaveBeenCalledWith({ to: '/nueva-contrasena' })
    expect(signOut).toHaveBeenCalledOnce()
  })
})
