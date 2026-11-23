import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { query, search } = vi.hoisted(() => ({ query: vi.fn(), search: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: query,
  queryOptions: (value: unknown) => value,
}))
vi.mock('@tanstack/react-router', () => ({ useSearch: search }))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { StripeConnectSettings } from './stripe-connect-settings'

describe('Stripe settings', () => {
  it('allows an unconnected company to link Stripe without claiming payments work', () => {
    search.mockReturnValue({})
    query.mockReturnValue({ data: { connected: false, liveMode: false } })
    const html = renderToStaticMarkup(<StripeConnectSettings tenantId="tenant-a" />)
    expect(html).toContain('Conectar Stripe')
    expect(html).toContain('Modo de pruebas')
    expect(html).toContain('Los cobros con Stripe todavía no están disponibles')
  })

  it('does not offer a second connection when the tenant is already linked', () => {
    search.mockReturnValue({ stripe: 'connected' })
    query.mockReturnValue({ data: { connected: true, liveMode: true } })
    const html = renderToStaticMarkup(<StripeConnectSettings tenantId="tenant-a" />)
    expect(html).toContain('Cuenta vinculada')
    expect(html).not.toContain('Conectar Stripe')
    expect(html).not.toContain('Modo de pruebas')
  })
})
