import { Children, isValidElement, type ReactNode } from 'react'
import type * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ContractLibraryTemplateEditor } from './contract-library-template-editor'

const state = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  save: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = state.cursor++
    if (!(index in state.values)) state.values[index] = initial
    return [
      state.values[index],
      (next: unknown) => {
        state.values[index] = typeof next === 'function' ? next(state.values[index]) : next
      },
    ]
  },
}))
vi.mock('@doscientos/ui', () => ({
  Button: () => null,
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}))
vi.mock('@/shared/ui/form', () => ({ TextField: () => null }))
vi.mock('../application/contract-template-library-actions', () => ({
  saveLibraryTemplate: state.save,
}))

type Props = {
  children?: ReactNode
  onClick?: () => void
  onSubmit?: (event: { preventDefault: () => void }) => void
  'aria-label'?: string
}
function elements(node: ReactNode): Array<{ type: unknown; props: Props }> {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<Props>(child)
      ? [{ type: child.type, props: child.props }, ...elements(child.props.children)]
      : [],
  )
}
const sections = [
  {
    id: 'a',
    title: 'Primera',
    content: 'A',
    page_break_before: false,
    format: 'plain' as const,
    revision: 1,
  },
  {
    id: 'b',
    title: 'Segunda',
    content: 'B',
    page_break_before: false,
    format: 'markdown' as const,
    revision: 1,
  },
]
const saved = vi.fn()
function render() {
  state.cursor = 0
  return elements(
    ContractLibraryTemplateEditor({
      tenantId: 'tenant',
      initial: { id: 'id', name: 'Plantilla', before_ids: [], after_ids: [], revision: 0 },
      sections,
      changed: vi.fn(),
      saved,
      saving: vi.fn(),
    }),
  )
}

describe('composición de plantilla', () => {
  beforeEach(() => {
    state.values = []
    vi.clearAllMocks()
    state.save.mockResolvedValue(1)
    state.invalidate.mockResolvedValue(undefined)
  })

  it('selecciona, ordena y guarda las secciones en la posición elegida', async () => {
    let nodes = render()
    nodes
      .filter((node) => node.type === 'button' && node.props.children === '+ Antes')[0]
      ?.props.onClick?.()
    nodes = render()
    nodes
      .filter((node) => node.type === 'button' && node.props.children === '+ Antes')[1]
      ?.props.onClick?.()
    nodes = render()
    nodes.find((node) => node.props['aria-label'] === 'Subir Segunda')?.props.onClick?.()
    nodes = render()
    nodes.find((node) => node.type === 'form')?.props.onSubmit?.({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(saved).toHaveBeenCalled())
    expect(state.save).toHaveBeenCalledWith('tenant', {
      id: 'id',
      name: 'Plantilla',
      before_ids: ['b', 'a'],
      after_ids: [],
      revision: 0,
    })
  })
})
