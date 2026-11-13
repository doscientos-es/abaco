import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ContractNextCollectionCell } from './contract-next-collection'

describe('next contract collection date', () => {
  it('does not invent a date for a contract without a scheduled payment', () => {
    const html = renderToStaticMarkup(<ContractNextCollectionCell collection={null} />)
    expect(html).toContain('Sin cobro programado')
    expect(html).not.toContain('<time')
  })

  it.each([
    ['invoice', false, 'Pendiente de cobro'],
    ['invoice', true, 'Vencido · pendiente de cobro'],
    ['draft', false, 'Borrador · pendiente de emitir'],
    ['draft', true, 'Borrador · fecha vencida'],
  ] as const)('distinguishes %s collections with overdue=%s', (source, overdue, label) => {
    const html = renderToStaticMarkup(
      <ContractNextCollectionCell
        collection={{
          due_on: '2026-12-01',
          source,
          is_overdue: overdue,
        }}
      />,
    )
    expect(html).toContain('dateTime="2026-12-01"')
    expect(html).toContain('01/12/2026')
    expect(html).toContain(label)
    expect(html.includes('text-destructive')).toBe(overdue)
  })
})
