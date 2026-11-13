import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EstimateSection } from '@/shared/domain/estimate-document'
import type { Estimate } from '@/shared/domain/types'

import { EstimateSectionsEditor } from './estimate-sections-editor'

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  patch: vi.fn(),
  newId: vi.fn(),
  buttons: [] as { children: React.ReactNode; onPress?: () => void; isDisabled?: boolean }[],
  icons: [] as { label: string; onPress: () => void }[],
  dialogs: [] as { open: boolean; onConfirm: () => void; onOpenChange: (open: boolean) => void }[],
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: mocks.state,
}))
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    Button: (props: (typeof mocks.buttons)[number]) => {
      mocks.buttons.push(props)
      return <button disabled={props.isDisabled}>{props.children}</button>
    },
    Card: Container,
    CardContent: Container,
    IconButton: (props: (typeof mocks.icons)[number]) => {
      mocks.icons.push(props)
      return <button aria-label={props.label} />
    },
    ConfirmDialog: (props: (typeof mocks.dialogs)[number]) => {
      mocks.dialogs.push(props)
      return null
    },
  }
})
vi.mock('@/shared/ui/form', () => ({
  TextField: () => null,
}))
vi.mock('@/shared/store/store', () => ({ newId: mocks.newId }))
vi.mock('../application/estimate-actions', () => ({ patchEstimate: mocks.patch }))
vi.mock('./estimate-section-price-editor', () => ({
  EstimateSectionPriceEditor: () => <p>Editor de precios</p>,
}))
vi.mock('./estimate-section-content-editor', () => ({
  EstimateSectionContentEditor: ({ section }: { section: { type: string } }) => (
    <p>Editor de {section.type}</p>
  ),
}))

const estimate: Estimate = {
  id: 'estimate',
  tenantId: 'tenant',
  clientId: 'client',
  number: 'P-1',
  title: 'Oferta',
  status: 'draft',
  documentFormat: 'sections',
  sections: [
    { id: 'section', type: 'description', title: 'Alcance', pageBreakBefore: false, content: '' },
  ],
  lines: [],
  milestones: [],
  discountType: 'none',
  discountValue: 0,
  vatRate: 21,
  clauses: '',
  validUntil: '2027-01-01',
  createdAt: '2026-11-13',
}

function render(value = estimate, removing: EstimateSection | null = null) {
  mocks.state.mockReturnValueOnce([removing, vi.fn()])
  return renderToStaticMarkup(<EstimateSectionsEditor estimate={value} />)
}

function first<T>(values: T[]): T {
  const value = values[0]
  if (value === undefined) throw new Error('Expected a rendered control or recorded call')
  return value
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.newId.mockReturnValue('80000000-0000-4000-8000-000000000050')
  mocks.buttons.length = 0
  mocks.icons.length = 0
  mocks.dialogs.length = 0
})

describe('estimate sections editor', () => {
  it('does not offer a page-break option even for sections saved with one', () => {
    const html = render({
      ...estimate,
      sections: [
        {
          id: 'section',
          type: 'description',
          title: 'Alcance',
          pageBreakBefore: true,
          content: '',
        },
      ],
    })
    expect(html).not.toContain('Empezar esta sección en una página nueva al imprimir')
    expect(html).not.toContain('type="checkbox"')
    expect(mocks.patch).not.toHaveBeenCalled()
  })

  it('adds a text section directly without showing any type selector', () => {
    const html = render()
    expect(html).toContain('Editor de description')
    expect(html).toContain('Añadir sección de texto')
    expect(html).not.toContain('Tipo de la sección')
    first(mocks.buttons).onPress?.()
    expect(mocks.patch).toHaveBeenCalledWith('estimate', {
      sections: [
        ...(estimate.sections ?? []),
        expect.objectContaining({ type: 'description', content: '', title: 'Texto' }),
      ],
    })
  })

  it('keeps historical lists editable without changing their content', () => {
    const html = render({
      ...estimate,
      sections: [
        {
          id: 'section',
          type: 'list',
          title: 'Incluye',
          pageBreakBefore: false,
          items: [{ id: 'item', text: 'Productos' }],
        },
      ],
    })
    expect(html).toContain('Editor de list')
    expect(html).not.toContain('Tipo de la sección')
    expect(mocks.patch).not.toHaveBeenCalled()
  })

  it('adds multiple text sections while preserving existing sections', () => {
    mocks.newId
      .mockReturnValueOnce('80000000-0000-4000-8000-000000000050')
      .mockReturnValueOnce('80000000-0000-4000-8000-000000000051')
    render()
    first(mocks.buttons).onPress?.()
    const firstPatch = first(mocks.patch.mock.calls)[1] as Partial<Estimate>
    mocks.buttons.length = 0
    render({ ...estimate, ...firstPatch })
    first(mocks.buttons).onPress?.()
    const secondPatch = mocks.patch.mock.calls[1]?.[1] as Partial<Estimate>
    expect(secondPatch.sections?.map((section) => section.type)).toEqual([
      'description',
      'description',
      'description',
    ])
    expect(new Set(secondPatch.sections?.map((section) => section.id)).size).toBe(3)
  })

  it('disables adding text when the existing persisted section limit is reached', () => {
    const sections = Array.from({ length: 50 }, (_, index) => ({
      id: String(index),
      type: 'description' as const,
      title: 'Texto',
      pageBreakBefore: false,
      content: '',
    }))
    const html = render({ ...estimate, sections })
    expect(first(mocks.buttons).isDisabled).toBe(true)
    expect(html).toContain('Máximo 50 secciones')
  })

  it('keeps both required blocks reorderable but hides deletion, duplication and type selectors', () => {
    const value: Estimate = {
      ...estimate,
      sections: [
        { id: 'price', type: 'prices', title: 'Precio', pageBreakBefore: false, lineIds: [] },
        {
          id: 'services',
          type: 'work_table',
          title: 'Servicios',
          pageBreakBefore: false,
          rows: [],
        },
        ...(estimate.sections ?? []),
      ],
    }
    const html = render(value)
    expect(html).toContain('Editor de precios')
    expect(html).toContain('Editor de work_table')
    expect(html).not.toContain('Tipo de la sección')
    const labels = mocks.icons.map((icon) => icon.label)
    expect(labels).not.toContain('Eliminar sección 1')
    expect(labels).not.toContain('Eliminar sección 2')
    expect(labels).not.toContain('Duplicar sección 1')
    expect(labels).not.toContain('Duplicar sección 2')
    expect(labels).toContain('Eliminar sección 3')
    mocks.icons.find((icon) => icon.label === 'Bajar sección 1')?.onPress()
    expect(mocks.patch).toHaveBeenCalledWith('estimate', {
      sections: [value.sections?.[1], value.sections?.[0], value.sections?.[2]],
    })
  })
})
