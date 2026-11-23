import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { EstimateSuggestionPreview } from './estimate-suggestion-preview'

describe('estimate suggestion review', () => {
  const complete = {
    description: 'Cable',
    details: null,
    kind: 'material' as const,
    unit: 'm',
    quantity: 2,
    unitPriceCents: 350,
  }

  it('distinguishes complete items from missing prices before the user applies them', () => {
    const html = renderToStaticMarkup(
      <EstimateSuggestionPreview
        suggestion={{
          message: 'Revisa esta propuesta.',
          lines: [complete, { ...complete, description: 'Instalación', unitPriceCents: null }],
        }}
        onApply={vi.fn()}
      />,
    )
    expect(html).toContain('Revisa esta propuesta.')
    expect(html).toContain('Precio pendiente')
    expect(html).toContain('Una partida necesita más datos')
    expect(html).toContain('Añadir 1 partida')
  })

  it('never offers to apply incomplete suggestions', () => {
    const html = renderToStaticMarkup(
      <EstimateSuggestionPreview
        suggestion={{ message: '¿Cuántos metros?', lines: [{ ...complete, quantity: null }] }}
        onApply={vi.fn()}
      />,
    )
    expect(html).toContain('Cantidad pendiente')
    expect(html).not.toContain('Añadir 1 partida')
  })
})
