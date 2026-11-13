import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { InvoicesPage } from './invoices-page'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/facturas">{children}</a>,
  useNavigate: () => vi.fn(),
  useSearch: () => ({ q: 'F-2026-003' }),
}))
vi.mock('@/features/auth', () => ({ useSession: () => ({ role: 'admin', tenantId: 'tenant' }) }))
vi.mock('@/shared/store/store', () => ({
  refreshStore: vi.fn(),
  useTenantData: () => ({
    invoices: [
      {
        id: 'invoice-3',
        number: 'F-2026-003',
        concept: 'Reparación',
        clientId: 'client-1',
        estimateId: null,
        contractPeriodId: null,
        dueDate: '2026-01-01',
        status: 'issued',
        totalCents: 23141,
        paidCents: 0,
      },
      {
        id: 'invoice-2',
        number: 'F-2026-002',
        concept: 'Otro trabajo',
        clientId: 'client-1',
        estimateId: null,
        contractPeriodId: null,
        dueDate: '2026-01-01',
        status: 'issued',
        totalCents: 10000,
        paidCents: 0,
      },
    ],
    clients: [{ id: 'client-1', name: 'Cliente' }],
    estimates: [],
  }),
}))

describe('lista de facturas emitidas', () => {
  it('muestra la factura filtrada tanto en tarjetas como en la tabla de escritorio', () => {
    const html = renderToStaticMarkup(<InvoicesPage />)
    expect(html).toContain('1 factura')
    expect(html).toContain('F-2026-003')
    expect(html).not.toContain('F-2026-002')
    expect(html.indexOf('aria-label="Buscar facturas"')).toBeLessThan(
      html.indexOf('aria-label="Filtros adicionales"'),
    )
    expect(html).toContain('Filtros adicionales')
    expect(html).toContain('xl:hidden')
    expect(html).toMatch(/data-slot="table-container" class="[^"]*max-xl:hidden/)
    expect(html).not.toMatch(/data-slot="table-container" class="[^"]*\shidden(?:\s|")/)
  })
})
