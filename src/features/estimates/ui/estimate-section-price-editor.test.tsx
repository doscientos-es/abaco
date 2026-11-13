import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Estimate } from '@/shared/domain/types'
import type { SelectField } from '@/shared/ui/form'

import type { PriceSection } from '../domain/estimate-section-price'
import { EstimateDraftProvider } from './estimate-draft-context'
import { EstimateSectionPriceEditor } from './estimate-section-price-editor'
import type { PriceInput } from './price-input'

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  setError: vi.fn(),
  patch: vi.fn(),
  select: vi.fn(),
  price: vi.fn(),
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: mocks.state,
}))
vi.mock('../application/estimate-actions', () => ({ patchEstimate: mocks.patch }))
vi.mock('@/shared/store/store', () => ({ newId: () => 'line' }))
vi.mock('@/shared/ui/form', () => ({
  FormField: ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label>
      {label}
      {children}
    </label>
  ),
  SelectField: (props: React.ComponentProps<typeof SelectField>) => {
    mocks.select(props)
    return (
      <select aria-label={props.label} defaultValue={props.value}>
        {props.options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    )
  },
}))
vi.mock('./price-input', () => ({
  PriceInput: (props: React.ComponentProps<typeof PriceInput>) => {
    mocks.price(props)
    return <input aria-label={props.label} defaultValue={props.cents} />
  },
}))

const section: PriceSection = {
  id: 'price',
  title: 'Precio',
  type: 'prices',
  pageBreakBefore: false,
  lineIds: ['line'],
}
const estimate: Estimate = {
  id: 'estimate',
  tenantId: 'tenant',
  clientId: 'client',
  number: 'P-1',
  title: 'Servicio',
  status: 'draft',
  documentFormat: 'sections',
  conversionDestination: 'contract',
  contractBillingFrequency: 'monthly',
  sections: [section],
  lines: [
    {
      id: 'line',
      catalogItemId: null,
      description: 'Precio',
      kind: 'labor',
      unit: 'ud',
      quantity: 1,
      unitPriceCents: 17_878,
      discountPercent: 0,
    },
  ],
  discountType: 'none',
  discountValue: 0,
  vatRate: 21,
  milestones: [],
  clauses: '',
  validUntil: '2027-01-01',
  createdAt: '2026-11-13',
}

function priceProps(): React.ComponentProps<typeof PriceInput> {
  const props = mocks.price.mock.calls[0]?.[0] as
    | React.ComponentProps<typeof PriceInput>
    | undefined
  if (!props) throw new Error('Price input was not rendered')
  return props
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.mockReturnValue([null, mocks.setError])
})

describe('simple price section editor', () => {
  it('keeps price edits local during creation instead of invoking autosave', () => {
    const patch = vi.fn()
    renderToStaticMarkup(
      <EstimateDraftProvider
        value={{ estimate, patch, busy: false, submitted: false, error: null }}
      >
        <EstimateSectionPriceEditor estimate={estimate} section={section} />
      </EstimateDraftProvider>,
    )
    priceProps().onCommit(24_200)
    expect(patch).toHaveBeenCalledWith(
      'estimate',
      expect.objectContaining({ lines: expect.any(Array) }),
    )
    expect(mocks.patch).not.toHaveBeenCalled()
  })

  it('shows only amount and periodicity inputs with the final wording as a preview', () => {
    const html = renderToStaticMarkup(
      <EstimateSectionPriceEditor estimate={estimate} section={section} />,
    )
    expect(priceProps().cents).toBe(21_632)
    expect(html.match(/<input/g)).toHaveLength(1)
    expect(html.match(/<select/g)).toHaveLength(1)
    expect(html).toContain('PRESUPUESTO MENSUAL. -')
    expect(html).toContain(
      'DOSCIENTOS DIECISÉIS EUROS CON TREINTA Y DOS CÉNTIMOS (216,32.-) impuestos incluidos.',
    )
    expect(html).not.toContain('Añadir partida')
  })

  it('stores a single taxable line when committing the tax-inclusive amount', () => {
    renderToStaticMarkup(<EstimateSectionPriceEditor estimate={estimate} section={section} />)
    priceProps().onCommit(24_200)
    expect(mocks.patch).toHaveBeenCalledWith(
      'estimate',
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            id: 'line',
            quantity: 1,
            unitPriceCents: 20_000,
            discountPercent: 0,
          }),
        ],
      }),
    )
  })

  it('keeps the contract periodicity synchronized with the selected price frequency', () => {
    renderToStaticMarkup(<EstimateSectionPriceEditor estimate={estimate} section={section} />)
    const props = mocks.select.mock.calls[0]?.[0] as
      | React.ComponentProps<typeof SelectField>
      | undefined
    if (!props) throw new Error('Periodicity selector was not rendered')
    props.onChange('yearly')
    expect(mocks.patch).toHaveBeenCalledWith('estimate', { contractBillingFrequency: 'yearly' })
  })

  it('saves the exact price even when reverse VAT rounding differs', () => {
    renderToStaticMarkup(<EstimateSectionPriceEditor estimate={estimate} section={section} />)
    priceProps().onCommit(21_633)
    expect(mocks.patch).toHaveBeenCalledWith(
      'estimate',
      expect.objectContaining({
        sections: [expect.objectContaining({ grossCents: 21_633 })],
      }),
    )
    expect(mocks.setError).toHaveBeenCalledWith(null)
  })
})
