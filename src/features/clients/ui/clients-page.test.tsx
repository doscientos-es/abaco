import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientsPage } from './clients-page'

const mocks = vi.hoisted(() => ({
  archived: false,
  target: null as { id: string; name: string } | null,
  stateIndex: 0,
  setTarget: vi.fn(),
  navigate: vi.fn(),
  update: vi.fn(),
  actions: new Map<string, (() => void)[]>(),
  confirm: null as (() => void) | null,
}))

vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = mocks.stateIndex++
    return [
      index === 2 ? mocks.archived : index === 3 ? mocks.target : initial,
      index === 3 ? mocks.setTarget : vi.fn(),
    ]
  },
}))
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    Button: Container,
    ConfirmDialog: ({ onConfirm }: { onConfirm: () => void }) => {
      mocks.confirm = onConfirm
      return null
    },
    IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
      mocks.actions.set(label, [...(mocks.actions.get(label) ?? []), onPress])
      return <button aria-label={label} />
    },
    Input: () => null,
    PageHeader: Container,
    PageHeaderActions: Container,
    PageHeaderDescription: Container,
    PageHeaderHeading: Container,
    PageHeaderTitle: Container,
    Table: Container,
    TableBody: Container,
    TableCell: Container,
    TableHead: Container,
    TableHeader: Container,
    TableRow: Container,
  }
})
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [{ value: 'type' }] }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/clientes">{children}</a>,
  useNavigate: () => mocks.navigate,
}))
vi.mock('@/shared/store/store', () => ({
  newId: vi.fn(),
  updateTenantData: mocks.update,
  useTenantData: () => ({
    tenant: { id: 'tenant' },
    clients: [
      { id: 'active', name: 'Ana' },
      { id: 'archived', name: 'Bea', archivedAt: '2026-01-01' },
    ],
  }),
}))
vi.mock('@/shared/ui/import-dialog', () => ({ ImportDialog: () => null }))
vi.mock('@/shared/ui/page-states', () => ({ EmptyPanel: () => null }))
vi.mock('@/shared/ui/use-pagination', () => ({
  usePagination: (items: unknown[]) => ({ pageItems: items }),
  TablePagination: () => null,
}))
vi.mock('../application/client-types', () => ({ clientTypesQuery: () => ({}) }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.stateIndex = 0
  mocks.archived = false
  mocks.target = null
  mocks.actions.clear()
  mocks.confirm = null
})

describe('client row actions', () => {
  it('offers labeled edit and archive actions for mobile and desktop', () => {
    const html = renderToStaticMarkup(<ClientsPage />)
    expect(html.match(/aria-label="Editar Ana"/g)).toHaveLength(2)
    expect(html.match(/aria-label="Archivar Ana"/g)).toHaveLength(2)
    mocks.actions.get('Editar Ana')?.[0]?.()
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/clientes/$clientId/editar',
      params: { clientId: 'active' },
    })
    mocks.actions.get('Archivar Ana')?.[1]?.()
    expect(mocks.setTarget).toHaveBeenCalledWith(expect.objectContaining({ id: 'active' }))
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('restores only the selected archived client in both layouts', () => {
    mocks.archived = true
    renderToStaticMarkup(<ClientsPage />)
    expect(mocks.actions.get('Restaurar Bea')).toHaveLength(2)
    mocks.actions.get('Restaurar Bea')?.[0]?.()
    const update = mocks.update.mock.calls[0]?.[0] as (data: {
      clients: { id: string; archivedAt: string }[]
    }) => { clients: { id: string; archivedAt: string | null }[] }
    expect(
      update({
        clients: [
          { id: 'archived', archivedAt: 'old' },
          { id: 'other', archivedAt: 'old' },
        ],
      }).clients,
    ).toEqual([
      { id: 'archived', archivedAt: null },
      { id: 'other', archivedAt: 'old' },
    ])
  })

  it('archives only after confirmation', () => {
    mocks.target = { id: 'active', name: 'Ana' }
    renderToStaticMarkup(<ClientsPage />)
    expect(mocks.update).not.toHaveBeenCalled()
    mocks.confirm?.()
    const update = mocks.update.mock.calls[0]?.[0] as (data: { clients: { id: string }[] }) => {
      clients: { id: string; archivedAt?: string }[]
    }
    const clients = update({ clients: [{ id: 'active' }, { id: 'other' }] }).clients
    expect(clients[0]?.archivedAt).toEqual(expect.any(String))
    expect(clients[1]?.archivedAt).toBeUndefined()
  })
})
