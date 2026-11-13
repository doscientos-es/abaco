import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Estimate } from '@/shared/domain/types'
import type { SelectField } from '@/shared/ui/form'

import { EstimateSectionsEditor } from './estimate-sections-editor'

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  changeType: vi.fn(),
  patch: vi.fn(),
  selects: [] as React.ComponentProps<typeof SelectField>[],
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
    Button: Container,
    Card: Container,
    CardContent: Container,
    IconButton: (props: (typeof mocks.icons)[number]) => {
      mocks.icons.push(props)
      return <button aria-label={props.label} />
    },
    DropdownMenuContent: Container,
    DropdownMenuItem: Container,
    DropdownMenuTrigger: Container,
    ConfirmDialog: (props: (typeof mocks.dialogs)[number]) => {
      mocks.dialogs.push(props)
      return null
    },
  }
})
vi.mock('@/shared/ui/form', () => ({
  TextField: () => null,
  SelectField: (props: React.ComponentProps<typeof SelectField>) => {
    mocks.selects.push(props)
    return <span>{props.label}</span>
  },
}))
vi.mock('@/shared/store/store', () => ({ newId: () => '80000000-0000-4000-8000-000000000050' }))
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

function render(value = estimate, pending: { sectionId: string; type: string } | null = null) {
  mocks.state.mockReturnValueOnce([null, vi.fn()]).mockReturnValueOnce([pending, mocks.changeType])
  return renderToStaticMarkup(<EstimateSectionsEditor estimate={value} />)
}

function first<T>(values: T[]): T {
  const value = values[0]
  if (value === undefined) throw new Error('Expected a rendered control or recorded call')
  return value
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.selects.length = 0
  mocks.icons.length = 0
  mocks.dialogs.length = 0
})

describe('estimate section type selector', () => {
  it('only offers optional text in type selectors and rejects stale required-type callbacks', () => {
    expect(render()).toContain('Editor de description')
    expect(mocks.selects[0]?.options.map(({ label }) => label)).toEqual(['Texto'])
    first(mocks.selects).onChange('work_table')
    expect(mocks.changeType).not.toHaveBeenCalled()
    expect(mocks.patch).not.toHaveBeenCalled()
  })

  it('requires confirmation before discarding content and leaves cancellation untouched', () => {
    const value: Estimate = {
      ...estimate,
      sections: [
        {
          id: 'section',
          type: 'list',
          title: 'Alcance',
          pageBreakBefore: false,
          items: [{ id: 'item', text: 'Texto existente' }],
        },
      ],
    }
    render(value)
    first(mocks.selects).onChange('description')
    expect(mocks.patch).not.toHaveBeenCalled()
    expect(mocks.changeType).toHaveBeenCalledWith({ sectionId: 'section', type: 'description' })
    first(mocks.dialogs).onOpenChange(false)
    expect(mocks.changeType).toHaveBeenLastCalledWith(null)
    expect(mocks.patch).not.toHaveBeenCalled()
  })

  it('allows confirmation for converting a historical list to optional text', () => {
    const value: Estimate = {
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
    }
    render(value, { sectionId: 'section', type: 'description' })
    expect(mocks.dialogs[0]?.open).toBe(true)
    first(mocks.dialogs).onConfirm()
    const patch = first(mocks.patch.mock.calls)[1] as Partial<Estimate>
    expect(patch.sections?.[0]).toMatchObject({ type: 'description', content: '' })
  })

  it('keeps historical lists editable and lets them switch to a current type', () => {
    render({
      ...estimate,
      sections: [
        { id: 'section', type: 'list', title: 'Incluye', pageBreakBefore: false, items: [] },
      ],
    })
    expect(mocks.selects[0]?.value).toBe('list')
    expect(mocks.selects[0]?.options.map(({ label }) => label)).toEqual(['Texto', 'Lista'])
    first(mocks.selects).onChange('description')
    expect(mocks.patch).toHaveBeenCalledWith(
      'estimate',
      expect.objectContaining({
        sections: [expect.objectContaining({ type: 'description', content: '' })],
      }),
    )
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
    expect(mocks.selects.map((select) => select.label)).toEqual(['Tipo de la sección 3'])
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
