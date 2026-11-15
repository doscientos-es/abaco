import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { InvoicesPage } from './invoices-page'

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), rows: [] as Array<() => void> }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/facturas" className={className}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate,
  useSearch: () => ({ q: 'F-2026-003' }),
}))
vi.mock('@/shared/ui/navigable-table-row', () => ({
  NavigableTableRow: ({ children, onOpen }: { children: ReactNode; onOpen: () => void }) => {
    mocks.rows.push(onOpen)
    return <tr>{children}</tr>
  },
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
  it('abre la factura correspondiente desde la fila', () => {
    mocks.rows = []
    mocks.navigate.mockClear()
    renderToStaticMarkup(<InvoicesPage />)
    mocks.rows[0]?.()
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/facturas/$invoiceId',
      params: { invoiceId: 'invoice-3' },
    })
  })
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

  it('mantiene el concepto y el importe compactos en las tarjetas a cualquier ancho', () => {
    const html = renderToStaticMarkup(<InvoicesPage />)
    const cards = html.match(/<ul class="space-y-2 xl:hidden">([\s\S]*?)<\/ul>/)?.[1]
    expect(cards).toMatch(/<a[^>]+class="[^"]*text-sm[^"]*"[^>]*>Reparación<\/a>/)
    const amountClasses = cards?.match(/<p class="([^"]+)">[^<]*€<\/p>/)?.[1]?.split(' ')
    expect(amountClasses).toEqual(
      expect.arrayContaining(['text-sm', 'font-medium', 'tabular-nums', 'whitespace-nowrap']),
    )
    expect(cards).not.toMatch(/text-xl|md:text-base|font-semibold/)
  })
})
