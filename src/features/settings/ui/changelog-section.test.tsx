import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ChangelogSection } from './changelog-section'

const release = {
  version: '0.0.2',
  date: '2026-10-14',
  title: 'v0.0.2',
  sections: [{ title: 'Mejoras', items: ['Consulta la versión instalada en Ajustes.'] }],
}

describe('ChangelogSection', () => {
  it('renders versioned releases, dates and their changes', () => {
    const html = renderToStaticMarkup(<ChangelogSection releases={[release]} />)

    expect(html).toContain('Historial de novedades')
    expect(html).toContain('v0.0.2')
    expect(html).toContain('dateTime="2026-10-14"')
    expect(html).toContain('14 de octubre de 2026')
    expect(html).toContain('Mejoras')
    expect(html).toContain('Consulta la versión instalada en Ajustes.')
  })

  it('has an empty state when no user-facing commits exist', () => {
    const html = renderToStaticMarkup(<ChangelogSection releases={[]} />)

    expect(html).toContain('Pronto compartiremos novedades.')
    expect(html).not.toContain('Historial de novedades')
  })

  it('shows pending changes without pretending they have a released version', () => {
    const html = renderToStaticMarkup(
      <ChangelogSection releases={[{ ...release, version: null, title: 'Sin publicar' }]} />,
    )

    expect(html).toContain('Sin publicar')
    expect(html).not.toContain('v0.0.2')
  })

  it('escapes commit descriptions instead of rendering them as HTML', () => {
    const html = renderToStaticMarkup(
      <ChangelogSection
        releases={[
          { ...release, sections: [{ title: 'Mejoras', items: ['<script>alert(1)</script>'] }] },
        ]}
      />,
    )

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('paginates the history instead of rendering every release at once', () => {
    const releases = Array.from({ length: 6 }, (_, index) => ({
      ...release,
      title: `v0.0.${index + 2}`,
    }))
    const html = renderToStaticMarkup(<ChangelogSection releases={releases} />)

    expect(html).toContain('v0.0.6')
    expect(html).not.toContain('v0.0.7')
    expect(html).toContain('Paginación de entradas')
  })
})
