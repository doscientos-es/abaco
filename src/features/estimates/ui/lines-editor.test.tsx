import type { ComponentProps, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { formatEuros } from '@/shared/domain/money'
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
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  HighlightMatch: () => null,
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}))
vi.mock('@phosphor-icons/react', () => {
  const Icon = () => <svg aria-hidden="true" />
  return { ArrowDown: Icon, ArrowUp: Icon, Copy: Icon, DotsThree: Icon, Trash: Icon }
})
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
  it('keeps the line fields, discount, total and actions in a responsive grid', () => {
    const markup = renderToStaticMarkup(<LinesEditor estimate={estimate} catalog={[]} />)

    expect(markup).toContain(
      '@min-[46rem]:grid-cols-[minmax(10rem,1fr)_4.75rem_4.5rem_7rem_5.5rem_minmax(5.5rem,auto)_2rem]',
    )
    expect(markup).toContain('aria-label="Descripción"')
    expect(markup).toContain('aria-label="Cantidad"')
    expect(markup).toContain('aria-label="Unidad"')
    expect(markup).toContain('aria-label="Precio unitario"')
    expect(markup).toContain('aria-label="Descuento de la línea (%)"')
    expect(markup).toContain('aria-label="Más opciones de Pintura de paredes"')
    expect(markup).toContain('Duplicar partida')
    expect(markup).toContain('Eliminar partida')
    expect(markup).toContain('<svg')
    expect(markup).toContain('aria-hidden="true"')
  })

  it('offers reorder actions when there are neighboring estimate lines', () => {
    const secondLine: EstimateLine = { ...line, id: 'line-2', description: 'Rodapié' }
    const markup = renderToStaticMarkup(
      <LinesEditor estimate={{ ...estimate, lines: [line, secondLine] }} catalog={[]} />,
    )

    expect(markup).toContain('Mover abajo')
    expect(markup).toContain('Mover arriba')
  })

  it('shows the original and discounted totals when a line has a discount', () => {
    const discounted = { ...line, discountPercent: 10 }
    const markup = renderToStaticMarkup(
      <LinesEditor estimate={{ ...estimate, lines: [discounted] }} catalog={[]} />,
    )

    expect(markup).toContain(formatEuros(8500))
    expect(markup).toContain(formatEuros(7650))
    expect(markup).toContain('line-through')
  })
})
