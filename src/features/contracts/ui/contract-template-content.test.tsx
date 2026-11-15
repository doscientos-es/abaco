import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ContractTemplateContent } from './contract-template-content'

describe('contenido de plantilla', () => {
  it('interpreta Markdown sin ejecutar HTML ni cargar imágenes remotas', () => {
    const html = renderToStaticMarkup(
      <ContractTemplateContent
        section={{
          id: '1',
          title: 'Condiciones',
          content:
            '**Importante** <script>alert(1)</script> ![foto](https://example.org/photo.png)',
          pageBreakBefore: false,
          format: 'markdown',
        }}
      />,
    )
    expect(html).toContain('<strong>Importante</strong>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
  })

  it('mantiene literalmente el contenido sin marcador de formato', () => {
    const html = renderToStaticMarkup(
      <ContractTemplateContent
        section={{ id: '2', title: '', content: '**literal**', pageBreakBefore: false }}
      />,
    )
    expect(html).toContain('**literal**')
    expect(html).not.toContain('<strong>')
  })
})
