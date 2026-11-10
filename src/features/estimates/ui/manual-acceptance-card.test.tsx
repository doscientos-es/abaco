import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ManualAcceptanceCard } from './manual-acceptance-card'

const props = {
  name: '',
  evidence: '',
  busy: false,
  onNameChange: vi.fn(),
  onEvidenceChange: vi.fn(),
  onSubmit: vi.fn(),
}

describe('aprobación manual', () => {
  it('avisa de que confirmar un borrador lo publica sin enviar correo', () => {
    const html = renderToStaticMarkup(<ManualAcceptanceCard {...props} draft />)
    expect(html).toContain('publicará y bloqueará esta versión, sin enviar ningún correo')
    expect(html).toContain('Nombre de quien aceptó')
    expect(html).toContain('Referencia de la evidencia')
  })

  it('no indica una nueva publicación para presupuestos ya enviados', () => {
    const html = renderToStaticMarkup(<ManualAcceptanceCard {...props} draft={false} />)
    expect(html).not.toContain('publicará y bloqueará')
    expect(html).toContain('Confirmar aprobación')
  })
})
