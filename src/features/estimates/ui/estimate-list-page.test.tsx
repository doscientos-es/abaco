import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { can } from '@/features/auth/domain/permissions'
import type { Estimate } from '@/shared/domain/types'

const draft: Estimate = {
  id: 'draft',
  tenantId: 'tenant',
  number: 'P-1',
  title: 'Limpieza',
  clientId: 'client',
  status: 'draft',
  lines: [],
  vatRate: 21,
  discountType: 'none',
  discountValue: 0,
  milestones: [],
  clauses: '',
  validUntil: '2026-12-01',
  createdAt: '2026-11-01',
}
const sent = { ...draft, id: 'sent', number: 'P-2', status: 'sent' } as Estimate
const mocks = vi.hoisted(() => ({
  role: 'admin' as 'admin' | 'user',
  target: null as Estimate | null,
  stateIndex: 0,
  setTarget: vi.fn(),
  navigate: vi.fn(),
  remove: vi.fn(),
  error: vi.fn(),
  invoices: [] as Array<{ tenantId: string; estimateId: string; milestoneId: string }>,
  actions: new Map<string, (() => void)[]>(),
  dialog: null as {
    open: boolean
    onConfirm: () => void
    onOpenChange: (open: boolean) => void
  } | null,
}))

vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = mocks.stateIndex++
    return [index === 6 ? mocks.target : initial, index === 6 ? mocks.setTarget : vi.fn()]
  },
}))
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    Button: Container,
    Badge: Container,
    Input: () => null,
    IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
      mocks.actions.set(label, [...(mocks.actions.get(label) ?? []), onPress])
      return <button aria-label={label} />
    },
    ConfirmDialog: (props: NonNullable<typeof mocks.dialog>) => {
      mocks.dialog = props
      return null
    },
    Table: Container,
    TableBody: Container,
    TableCell: Container,
    TableHead: Container,
    TableHeader: Container,
    TableRow: Container,
    toast: { error: mocks.error },
  }
})
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/presupuestos">{children}</a>,
  useNavigate: () => mocks.navigate,
}))
vi.mock('@/features/auth', () => ({ can, useSession: () => ({ role: mocks.role }) }))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({
    estimates: [draft, sent],
    clients: [{ id: 'client', name: 'Cliente' }],
    invoices: mocks.invoices,
  }),
}))
vi.mock('../application/estimate-actions', () => ({ deleteEstimate: mocks.remove }))
vi.mock('@/features/clients/ui/client-form-dialog', () => ({ ClientFormDialog: () => null }))
vi.mock('@/shared/ui/form', () => ({ SelectField: () => null, TextField: () => null }))
vi.mock('@/shared/ui/form-dialog', () => ({ FormDialog: () => null }))
vi.mock('@/shared/ui/page-states', () => ({ EmptyPanel: () => null }))
vi.mock('@/shared/ui/use-pagination', () => ({
  usePagination: (items: unknown[]) => ({ pageItems: items }),
  TablePagination: () => null,
}))
vi.mock('@/shared/ui/workspace-page-chrome', () => ({ WorkspacePageHeading: () => null }))
vi.mock('./estimate-format-picker', () => ({ EstimateFormatPicker: () => null }))

import { EstimateListPage } from './estimate-list-page'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.role = 'admin'
  mocks.target = null
  mocks.stateIndex = 0
  mocks.actions.clear()
  mocks.dialog = null
  mocks.invoices = []
})

describe('estimate list actions', () => {
  it('offers opening and deleting drafts on mobile and desktop, but never deletes a published estimate', () => {
    const html = renderToStaticMarkup(<EstimateListPage />)
    expect(html).toContain('Acciones')
    expect(mocks.actions.get('Abrir presupuesto P-1')).toHaveLength(2)
    expect(mocks.actions.get('Eliminar presupuesto P-1')).toHaveLength(2)
    expect(mocks.actions.get('Abrir presupuesto P-2')).toHaveLength(2)
    expect(mocks.actions.has('Eliminar presupuesto P-2')).toBe(false)
    mocks.actions.get('Abrir presupuesto P-1')?.[0]?.()
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/presupuestos/$estimateId',
      params: { estimateId: 'draft' },
    })
    mocks.actions.get('Eliminar presupuesto P-1')?.[1]?.()
    expect(mocks.setTarget).toHaveBeenCalledWith(draft)
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('deletes the selected draft only after confirmation and closes the dialog on cancel', () => {
    mocks.target = draft
    renderToStaticMarkup(<EstimateListPage />)
    expect(mocks.dialog?.open).toBe(true)
    mocks.dialog?.onOpenChange(false)
    expect(mocks.setTarget).toHaveBeenCalledWith(null)
    expect(mocks.remove).not.toHaveBeenCalled()
    mocks.dialog?.onConfirm()
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith('draft')
  })

  it('does not offer or execute deletion without write permission', () => {
    mocks.role = 'user'
    mocks.target = draft
    renderToStaticMarkup(<EstimateListPage />)
    expect(mocks.actions.has('Eliminar presupuesto P-1')).toBe(false)
    mocks.dialog?.onConfirm()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('does not offer deletion for legacy drafts with an issued invoice', () => {
    mocks.invoices = [{ tenantId: 'tenant', estimateId: 'draft', milestoneId: 'milestone' }]
    renderToStaticMarkup(<EstimateListPage />)
    expect(mocks.actions.has('Eliminar presupuesto P-1')).toBe(false)
    expect(mocks.actions.get('Abrir presupuesto P-1')).toHaveLength(2)
  })

  it('shows a clear error if deletion becomes invalid after opening confirmation', () => {
    mocks.target = draft
    mocks.remove.mockImplementationOnce(() => {
      throw new Error('El presupuesto tiene facturas emitidas')
    })
    renderToStaticMarkup(<EstimateListPage />)
    mocks.dialog?.onConfirm()
    expect(mocks.error).toHaveBeenCalledWith('No se pudo eliminar el presupuesto', {
      description: 'El presupuesto tiene facturas emitidas',
    })
    expect(mocks.setTarget).not.toHaveBeenCalledWith(null)
  })
})
