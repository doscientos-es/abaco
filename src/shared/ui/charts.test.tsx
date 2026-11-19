import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { formatEuros } from '@/shared/domain/money'

import { ExpenseCategoryPlot, MonthlyBars } from './charts'

it('shows refunds below the same zero line used by positive amounts', () => {
  const html = renderToStaticMarkup(
    <MonthlyBars data={[{ label: 'mar', income: -5000, expense: 5000 }]} />,
  )

  expect(html).toContain(`mar: Ingresos ${formatEuros(-5000)}, Gastos ${formatEuros(5000)}`)
  expect(html).toContain('style="height:50%;top:50%"')
  expect(html).toContain('style="height:50%;bottom:50%"')
})

it('draws radial expenses as separate shares of the total with exact amounts in the legend', () => {
  const items = [
    { label: 'Material', value: 7500 },
    { label: 'Transporte', value: 2500 },
  ]
  const html = renderToStaticMarkup(<ExpenseCategoryPlot items={items} format="radial" />)

  expect(html).toContain('data-slot="category-rings"')
  expect(html).toContain('stroke-dasharray="75 25"')
  expect(html).toContain('stroke-dasharray="25 75"')
  expect(html).toContain('75 %')
  expect(html).toContain(formatEuros(7500))
  expect(html.match(/<button/g)).toHaveLength(2)
  expect(renderToStaticMarkup(<ExpenseCategoryPlot items={items} format="donut" />)).not.toContain(
    'category-rings',
  )
})
