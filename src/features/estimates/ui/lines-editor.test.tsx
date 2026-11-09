import type { ComponentProps, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { Estimate, EstimateLine } from '@/shared/domain/types'

vi.mock('@doscientos/ui', () => ({
  AutocompleteCombobox: () => null,
  Button: ({
    children,
    'aria-label': ariaLabel,
    title,
  }: {
    children?: ReactNode
    'aria-label'?: string
    title?: string
  }) => (
    <button aria-label={ariaLabel} title={title}>
      {children}
    </button>
  ),
  HighlightMatch: () => null,
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}))
vi.mock('../application/estimate-actions', () => ({ patchEstimate: vi.fn() }))

import { LinesEditor } from './lines-editor'

const line: EstimateLine = {
  id: 'line-1',
  catalogItemId: null,
  description: 'Pintura de paredes',
  kind: 'other',
  unit: 'ud',
  quantity: 2,
  unitPriceCents: 4250,
  discountPercent: 0,
}

const estimate = { id: 'estimate-1', status: 'draft', lines: [line] } as Estimate

describe('LinesEditor', () => {
  it('shows a compact desktop row and an accessible icon-only remove button', () => {
    const markup = renderToStaticMarkup(<LinesEditor estimate={estimate} catalog={[]} />)

    expect(markup).toContain(
      'lg:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_8rem]',
    )
    expect(markup).toContain('aria-label="Quitar Pintura de paredes"')
    expect(markup).toContain('<svg')
    expect(markup).toContain('aria-hidden="true"')
  })
})
