import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { formatEuros } from '@/shared/domain/money'

import { MonthlyBars } from './charts'

it('shows refunds below the same zero line used by positive amounts', () => {
  const html = renderToStaticMarkup(
    <MonthlyBars data={[{ label: 'mar', income: -5000, expense: 5000 }]} />,
  )

  expect(html).toContain(`mar: Ingresos ${formatEuros(-5000)}, Gastos ${formatEuros(5000)}`)
  expect(html).toContain('style="height:50%;top:50%"')
  expect(html).toContain('style="height:50%;bottom:50%"')
})
