import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FilterDisclosure } from './filter-disclosure'

describe('FilterDisclosure', () => {
  it.each([
    [0, 'Filtros adicionales'],
    [1, 'Filtros adicionales, 1 activo'],
    [2, 'Filtros adicionales, 2 activos'],
  ])('starts collapsed and announces %i active filters', (activeCount, label) => {
    const html = renderToStaticMarkup(
      <FilterDisclosure activeCount={activeCount}>
        <label>
          Estado <select aria-label="Estado" />
        </label>
      </FilterDisclosure>,
    )
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain(`aria-label="${label}"`)
    expect(html).not.toContain('aria-label="Estado"')
  })
})
