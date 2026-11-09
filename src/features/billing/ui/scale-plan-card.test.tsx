import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { formatEuros } from '../domain/plans'
import { ScalePlanCard } from './scale-plan-card'

describe('ScalePlanCard', () => {
  it('shows the entry price as an indicative estimate for smaller teams', () => {
    const html = renderToStaticMarkup(
      <ScalePlanCard members={1} interval="month" recommended={false} />,
    )

    expect(html).toContain('Desde')
    expect(html).toContain(formatEuros(57))
    expect(html).toContain('Para 16 personas, sin IVA.')
    expect(html).toContain('Tarifa mensual orientativa')
    expect(html).toContain('href="tel:+34624140151"')
    expect(html).not.toContain('<button')
  })

  it('calculates and labels the yearly amount and monthly equivalent for the selected team', () => {
    const html = renderToStaticMarkup(<ScalePlanCard members={32} interval="year" recommended />)

    expect(html).toContain('Te encaja')
    expect(html).toContain(formatEuros(87.5))
    expect(html).toContain('/mes equivalente')
    expect(html).toContain(`${formatEuros(1050)} al año para 32 personas, sin IVA.`)
    expect(html).toContain('El precio final se confirma antes de contratar.')
  })

  it('shows the monthly estimate for the maximum team size', () => {
    const html = renderToStaticMarkup(<ScalePlanCard members={100} interval="month" recommended />)

    expect(html).toContain(formatEuros(309))
    expect(html).toContain('Para 100 personas, sin IVA.')
    expect(html).not.toContain('/mes equivalente')
  })
})
