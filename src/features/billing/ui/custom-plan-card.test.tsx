import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CustomPlanCard } from './custom-plan-card'

describe('CustomPlanCard', () => {
  it('presents a distinct custom plan without a fixed price', () => {
    const html = renderToStaticMarkup(<CustomPlanCard members={101} />)

    expect(html).toContain('aria-label="Plan personalizado para más de 100 personas"')
    expect(html).toContain('<h3 class="text-sm font-semibold">Personalizado</h3>')
    expect(html).toContain('Más de 100 personas')
    expect(html).toContain('Hablemos')
    expect(html).not.toContain('€/mes')
    expect(html).not.toContain('Elegir Personalizado')
  })

  it('offers a tailored quote for Ábaco Escala teams up to 100 people', () => {
    const html = renderToStaticMarkup(<CustomPlanCard members={32} />)

    expect(html).toContain('aria-label="Propuesta de Ábaco Escala para 32 personas"')
    expect(html).toContain('<h3 class="text-sm font-semibold">Ábaco Escala</h3>')
    expect(html).toContain('16–100 personas')
    expect(html).toContain('Te preparamos una propuesta para 32 personas')
    expect(html).toContain('Pedir propuesta')
    expect(html).not.toContain('€/mes')
  })

  it('offers a phone link rather than a checkout action', () => {
    const html = renderToStaticMarkup(<CustomPlanCard members={101} />)

    expect(html).toContain('href="tel:+34624140151"')
    expect(html).toContain('Llámanos al 624 14 01 51 para un plan personalizado')
    expect(html).toContain('624 14 01 51')
    expect(html).not.toContain('<button')
  })
})
