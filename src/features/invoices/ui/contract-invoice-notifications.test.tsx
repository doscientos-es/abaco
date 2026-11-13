import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ContractInvoiceNotifications } from './contract-invoice-notifications'

const { query, mutation, invalidate } = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: query,
  useMutation: mutation,
  useQueryClient: () => ({ invalidateQueries: invalidate }),
}))
vi.mock('@doscientos/ui', () => ({
  IconButton: ({ children, label }: { children: ReactNode; label: string }) => (
    <button aria-label={label}>{children}</button>
  ),
  Popover: ({ children, trigger }: { children: ReactNode; trigger: ReactNode }) => (
    <div>
      {trigger}
      {children}
    </div>
  ),
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}))
vi.mock('../application/contract-invoice-notifications', () => ({
  listContractInvoiceNotifications: vi.fn(),
  readContractInvoiceNotification: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mutation.mockReturnValue({ mutate: vi.fn() })
})
const render = () =>
  renderToStaticMarkup(<ContractInvoiceNotifications tenantId="company" userId="admin" />)

describe('contract invoice notifications', () => {
  it('shows the invoice and a truthful mail status with a link that reloads server-generated data', () => {
    query.mockReturnValue({
      data: [
        {
          id: 'n1',
          invoice_id: 'invoice-1',
          invoice_number: 'F-1',
          concept: 'Limpieza',
          delivery_status: 'sent',
          read_at: null,
        },
        {
          id: 'n2',
          invoice_id: 'invoice-2',
          invoice_number: 'F-2',
          delivery_status: 'failed',
          error_code: 'email_missing',
          read_at: 'today',
        },
        {
          id: 'n3',
          invoice_id: 'invoice-3',
          invoice_number: 'F-3',
          delivery_status: 'pending',
          read_at: null,
        },
      ],
    })
    const html = render()
    expect(query.mock.calls[0]?.[0].queryKey).toEqual([
      'contract-invoice-notifications',
      'company',
      'admin',
    ])
    expect(html).toContain('2 avisos sin leer')
    expect(html).toContain('href="/facturas/invoice-1"')
    expect(html).toContain('Enviada por email al cliente')
    expect(html).toContain('el cliente no tiene un email válido')
    expect(html).toContain('Envío al cliente pendiente')
    expect(html.match(/Marcar como leído/g)).toHaveLength(2)
  })

  it('invalidates only the current user notifications after marking one read', async () => {
    query.mockReturnValue({ data: [] })
    render()
    await mutation.mock.calls[0]?.[0].onSuccess()
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['contract-invoice-notifications', 'company', 'admin'],
    })
  })

  it('distinguishes a failed lookup from an empty inbox', () => {
    query.mockReturnValue({ isError: true })
    expect(render()).toContain('No se pudieron cargar los avisos de facturación')
    expect(render()).not.toContain('No hay facturas automáticas')
    query.mockReturnValue({ data: [] })
    expect(render()).toContain('No hay facturas automáticas recientes')
  })
})
