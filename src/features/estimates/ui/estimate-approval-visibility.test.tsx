import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { can } from '@/features/auth/domain/permissions'
import type { Estimate } from '@/shared/domain/types'

const state = vi.hoisted(() => ({ status: 'draft', role: 'admin', automaticContract: false }))
const estimate = {
  id: 'estimate',
  tenantId: 'tenant',
  number: 'P-1',
  clientId: 'client',
  title: 'Trabajo',
  status: 'draft',
  lines: [],
  milestones: [],
  discountType: 'none',
  discountValue: 0,
  vatRate: 21,
  validUntil: '2026-12-01',
  createdAt: '2026-11-01',
  clauses: '',
} as Estimate

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/presupuestos">{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[0] === 'estimate-publication'
        ? {
            estimate: {
              ...estimate,
              status: state.status,
              automaticContract: state.automaticContract,
              conversionDestination: 'contract',
            },
            client: { name: 'Cliente' },
            tenant: { name: 'Empresa' },
          }
        : queryKey[0] === 'work-target-options'
          ? { locations: [], assets: [] }
          : null,
    isPending: false,
  }),
}))
vi.mock('@/features/auth', () => ({ can, useSession: () => ({ role: state.role }) }))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({
    tenant: { id: 'tenant', name: 'Empresa' },
    clients: [{ id: 'client', name: 'Cliente' }],
    estimates: [
      {
        ...estimate,
        status: state.status,
        automaticContract: state.automaticContract,
        conversionDestination: 'contract',
      },
    ],
    catalog: [],
    ledger: [],
  }),
  refreshStore: vi.fn(),
  getSaveStatus: () => ({ state: 'saved' }),
}))
vi.mock('./estimate-document', () => ({ EstimateDocument: () => null }))
vi.mock('./lines-editor', () => ({ LinesEditor: () => null }))
vi.mock('./milestones-editor', () => ({ MilestonesEditor: () => null }))
vi.mock('@/features/clients/ui/client-form-dialog', () => ({ ClientFormDialog: () => null }))

import { EstimateEditorPage } from './estimate-editor-page'

beforeEach(() => {
  state.status = 'draft'
  state.role = 'admin'
  state.automaticContract = false
})

describe('acceso a la aprobación del presupuesto', () => {
  it.each(['draft', 'sent'])('permite aprobar un presupuesto %s a un administrador', (status) => {
    state.status = status
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).toContain('Marcar como aprobado')
  })

  it.each(['accepted', 'rejected'])('no ofrece aprobar uno %s', (status) => {
    state.status = status
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).not.toContain('Marcar como aprobado')
  })

  it('no ofrece aprobar a un usuario sin permisos', () => {
    state.role = 'user'
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).not.toContain('Marcar como aprobado')
  })

  it('does not offer a second manual conversion for an automatically accepted contract', () => {
    state.status = 'accepted'
    state.automaticContract = true
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).not.toContain('Crear contrato')
    expect(html).toContain('Recargar contrato')
    expect(html).not.toContain('Piscina o activo')
  })

  it('preserves conversion for legacy published proposals', () => {
    state.status = 'accepted'
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).toContain('Crear contrato')
    expect(html).not.toContain('Piscina o activo')
  })
})
