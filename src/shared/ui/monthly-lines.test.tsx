import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { formatEuros } from '@/shared/domain/money'

import { monthlyLineScale } from './monthly-line-scale'
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
    expect(html.match(/<polygon /g)).toHaveLength(2)
    expect(html.match(/<button/g)).toHaveLength(2)
  })

  it('puts refunds below zero on the same scale as revenues', () => {
    const scale = monthlyLineScale([
      { key: '2026-01', label: 'ene', income: -5000, expense: 10000 },
    ])
    expect(scale.ticks).toEqual([-5000, 0, 5000, 10000])
    expect(scale.x(0)).toBe(50)
    expect(scale.y(-5000)).toBeGreaterThan(scale.y(0))
    expect(scale.y(10000)).toBeLessThan(scale.y(0))
  })

  it('keeps sub-euro changes legible without lifting zeros', () => {
    const scale = monthlyLineScale([{ key: '2026-01', label: 'ene', income: 3, expense: 0 }])
    expect(scale.ticks).toEqual([0, 1, 2, 3])
    expect(scale.y(0)).toBe(93)
    expect(scale.y(3)).toBe(7)
  })

  it('shows a meaningful empty state instead of an empty chart', () => {
    const html = renderToStaticMarkup(
      <MonthlyLines data={[{ key: '2026-01', label: 'ene', income: 0, expense: 0 }]} />,
    )
    expect(html).toContain('Sin movimientos todavía')
    expect(html).not.toContain('<button')
  })
})
