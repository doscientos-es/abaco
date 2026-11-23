import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EmptyPanel, PageLoading } from './page-states'

describe('page feedback', () => {
  it('announces loading while keeping decorative placeholders hidden', () => {
    const html = renderToStaticMarkup(<PageLoading />)
    expect(html).toContain('Preparando tu espacio…')
    expect(html).toContain('aria-label="Preparando tu espacio…"')
    expect(html).toContain('data-slot="spinner"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('grid-cols-2')
  })

  it('shows a helpful action without exposing the decorative icon', () => {
    const html = renderToStaticMarkup(
      <EmptyPanel icon={<span>icono</span>} title="Sin datos" description="Añade el primero.">
        <button>Crear</button>
      </EmptyPanel>,
    )
    expect(html).toContain('Sin datos')
    expect(html).toContain('Añade el primero.')
    expect(html).toContain('<button>Crear</button>')
    expect(html).toContain('aria-hidden="true"')
  })
})
