import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { formatEuros } from '@/shared/domain/money'

import { MonthlyLines } from './monthly-lines'

describe('monthly line chart', () => {
  it('offers keyboard-accessible values for both series', () => {
    const html = renderToStaticMarkup(
      <MonthlyLines
        data={[
          { key: '2026-01', label: 'ene', income: 5000, expense: 2000 },
          { key: '2026-02', label: 'feb', income: 10000, expense: 0 },
        ]}
      />,
    )
    expect(html).toContain(`ene: Ingresos ${formatEuros(5000)}, Gastos ${formatEuros(2000)}`)
    expect(html).toContain('stroke-success')
    expect(html).toContain('stroke-destructive')
    expect(html.match(/<button/g)).toHaveLength(2)
  })

  it('shows a meaningful empty state instead of an empty chart', () => {
    const html = renderToStaticMarkup(
      <MonthlyLines data={[{ key: '2026-01', label: 'ene', income: 0, expense: 0 }]} />,
    )
    expect(html).toContain('Sin movimientos todavía')
    expect(html).not.toContain('<button')
  })
})
