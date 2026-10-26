import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CustomPlanCard } from './custom-plan-card'

describe('CustomPlanCard', () => {
  it('presents a distinct custom plan without a fixed price', () => {
    const html = renderToStaticMarkup(<CustomPlanCard />)

    expect(html).toContain('aria-label="Plan personalizado"')
    expect(html).toContain('<h3 class="text-sm font-semibold">Personalizado</h3>')
    expect(html).toContain('A tu medida')
    expect(html).toContain('Hablemos')
    expect(html).not.toContain('€/mes')
    expect(html).not.toContain('Elegir Personalizado')
  })

  it('offers a phone link rather than a checkout action', () => {
    const html = renderToStaticMarkup(<CustomPlanCard />)

    expect(html).toContain('href="tel:+34624140151"')
    expect(html).toContain('Llámanos al 624 14 01 51 para un plan personalizado')
    expect(html).toContain('624 14 01 51')
    expect(html).not.toContain('<button')
  })
})
