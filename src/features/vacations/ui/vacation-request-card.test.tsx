import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { VacationRequest } from '../domain/vacation-request'
import { VacationRequestCard } from './vacation-request-card'

const request: VacationRequest = {
  id: 'request-1',
  requesterId: 'technician-1',
  requesterName: 'Ana Técnica',
  startDate: '2026-11-09',
  endDate: '2026-11-10',
  comment: '<script>contenido</script>',
  status: 'approved',
  submittedAt: '2026-11-01T10:00:00.000Z',
  decisionComment: 'Aprobada por el equipo.',
  decidedAt: '2026-11-02T10:00:00.000Z',
  decidedByName: 'Pol Administración',
}

describe('VacationRequestCard', () => {
  it('shows the inclusive period and auditable decision', () => {
    const html = renderToStaticMarkup(<VacationRequestCard request={request} showRequester />)
    expect(html).toContain('Ana Técnica')
    expect(html).toContain('9 de noviembre de 2026')
    expect(html).toContain('10 de noviembre de 2026')
    expect(html).toContain('Aprobada')
    expect(html).toContain('Pol Administración')
    expect(html).toContain('Aprobada por el equipo.')
  })

  it('escapes comments and does not render decision details while pending', () => {
    const html = renderToStaticMarkup(
      <VacationRequestCard
        request={{
          ...request,
          status: 'pending',
          decidedAt: null,
          decidedByName: '',
          decisionComment: '',
        }}
      />,
    )
    expect(html).toContain('&lt;script&gt;contenido&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Pendiente')
    expect(html).not.toContain('Decisión de')
  })
})
