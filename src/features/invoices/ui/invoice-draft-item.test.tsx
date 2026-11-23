import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { InvoiceDraft } from '../domain/invoice-draft'

const buttons = vi.hoisted(() => [] as Array<{ children: ReactNode; isDisabled?: boolean }>)
vi.mock('@doscientos/ui', () => ({
  Button: (props: { children: ReactNode; isDisabled?: boolean }) => {
    buttons.push(props)
    return <button disabled={props.isDisabled}>{props.children}</button>
  },
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
  linkOptions: (options: unknown) => options,
}))
vi.mock('@/shared/store/store', () => ({ refreshStore: vi.fn() }))
vi.mock('@/shared/ui/form', () => ({ SelectField: () => null }))
vi.mock('../application/invoice-draft-actions', () => ({
  issueInvoiceDraft: vi.fn(),
  updateInvoiceDraft: vi.fn(),
}))

import { InvoiceDraftItem } from './invoice-draft-item'

const draft: InvoiceDraft = {
  id: 'draft',
  tenantId: 'tenant',
  source: 'milestone',
  originId: 'estimate',
  concept: 'Pago 2',
  totalCents: 5000,
  dueDate: '',
  revision: 1,
}

describe('future invoice drafts', () => {
  it('requires a due date before issuing an unplanned installment', () => {
    buttons.length = 0
    const html = renderToStaticMarkup(
      <InvoiceDraftItem draft={draft} library={undefined} refresh={async () => {}} />,
    )
    expect(html).toContain('Indica el vencimiento antes de emitir.')
    expect(buttons.find((button) => button.children === 'Emitir factura')?.isDisabled).toBe(true)
  })

  it('allows issuing an unchanged draft with a due date', () => {
    buttons.length = 0
    renderToStaticMarkup(
      <InvoiceDraftItem
        draft={{ ...draft, dueDate: '2026-12-31' }}
        library={undefined}
        refresh={async () => {}}
      />,
    )
    expect(buttons.find((button) => button.children === 'Emitir factura')?.isDisabled).toBe(false)
  })
})
