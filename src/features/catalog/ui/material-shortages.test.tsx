import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MaterialShortages } from './material-shortages'

const mocks = vi.hoisted(() => ({ reason: 'insufficient', enabled: true, query: vi.fn() }))
vi.mock('@/features/product-modules', () => ({ useModuleEnabled: () => mocks.enabled }))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  buttonVariants: () => '',
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: (options: { queryKey: string[] }) => mocks.query(options),
}))

beforeEach(() => {
  mocks.reason = 'insufficient'
  mocks.enabled = true
  mocks.query.mockClear().mockImplementation(({ queryKey }: { queryKey: string[] }) => ({
    isPending: false,
    isError: false,
    data:
      queryKey[0] === 'inventory-shortages'
        ? [
            {
              id: 's',
              estimate_id: 'e',
              catalog_item_id: 'i',
              supplier_id: 'p',
              name: 'Tubo',
              sku: '',
              unit: 'm',
              missing_quantity: 2,
              reason: mocks.reason,
            },
          ]
        : queryKey[0] === 'suppliers'
          ? [{ id: 'p', name: 'Proveedor', email: 'pedidos@example.com', phone: '+34 612 345 678' }]
          : [],
  }))
})
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({
    tenant: { id: 't', name: 'Empresa' },
    estimates: [{ id: 'e', number: 'P-1' }],
  }),
}))
vi.mock('../application/inventory-actions', () => ({
  listInventory: vi.fn(),
  listShortages: vi.fn(),
  listSuppliers: vi.fn(),
  resolveShortage: vi.fn(),
}))

describe('material shortages', () => {
  it('offers manual contact by phone and email for an ordinary shortage', () => {
    const html = renderToStaticMarkup(<MaterialShortages />)
    expect(html).toContain('Preparar correo')
    expect(html).toContain('mailto:pedidos%40example.com')
    expect(html).toContain('tel:+34612345678')
  })

  it('explains unit mismatches instead of suggesting a potentially wrong order', () => {
    mocks.reason = 'unit_mismatch'
    const html = renderToStaticMarkup(<MaterialShortages />)
    expect(html).toContain('La unidad del presupuesto no coincide')
    expect(html).not.toContain('mailto:')
    expect(html).not.toContain('tel:')
  })

  it('does not fetch or show shortages without the module', () => {
    mocks.enabled = false
    expect(renderToStaticMarkup(<MaterialShortages />)).toBe('')
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
