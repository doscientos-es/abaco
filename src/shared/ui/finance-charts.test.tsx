import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { formatEuros } from '@/shared/domain/money'

import { ExpenseCategoryPlot } from './expense-category-plot'
import { MonthlyChart } from './monthly-chart'

it('lets keyboard users open exact monthly data, including refunds and empty months', () => {
  const html = renderToStaticMarkup(
    <MonthlyChart
      format="area"
      data={[
        { key: '2026-01', label: 'ene', income: -5000, expense: 2000 },
        { key: '2026-02', label: 'feb', income: 0, expense: 0 },
      ]}
    />,
  )
  expect(html).toMatch(/<details><summary[^>]*>Ver datos por mes<\/summary>/)
  expect(html).toContain('aria-label="Ingresos y gastos por mes"')
  expect(html).toContain(formatEuros(-5000))
  expect(html).toContain('feb 2026')
  expect(html).toContain(formatEuros(0))
})

it('does not initialize charts without movements', () => {
  const html = renderToStaticMarkup(
    <MonthlyChart
      format="lines"
      data={[{ key: '2026-01', label: 'ene', income: 0, expense: 0 }]}
    />,
  )
  expect(html).toContain('Sin movimientos todavía')
  expect(html).not.toContain('<figure')
})

it('shows exact category amounts and radial shares outside the SVG', () => {
  const html = renderToStaticMarkup(
    <ExpenseCategoryPlot
      items={[
        { label: 'Material', value: 7500 },
        { label: 'Transporte', value: 2500 },
      ]}
      format="radial"
    />,
  )

  expect(html).toContain('Material')
  expect(html).toContain(formatEuros(7500))
  expect(html).toContain('75 %')
  expect(html).toContain('25 %')
})
