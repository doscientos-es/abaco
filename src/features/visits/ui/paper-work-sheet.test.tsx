import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { VisitSummary } from '../application/visit-actions'
import { PaperWorkSheet } from './paper-work-sheet'

const visit: VisitSummary = {
  id: 'visit-1',
  title: 'Cristales',
  client_name: 'Cliente actual',
  location_name: 'Centro actual',
  address: 'Dirección actual',
  timezone: 'Europe/Madrid',
  scheduled_start_at: '2026-11-12T23:30:00Z',
  scheduled_end_at: '2026-11-13T01:30:00Z',
  status: 'scheduled',
  priority: 'normal',
  notes: 'Notas',
  updated_at: '2026-11-10T09:00:00Z',
  work_team_name: 'Equipo móvil A',
}

describe('paper work sheet', () => {
  it('prints the original snapshot and the local planned date without requiring a mobile app', () => {
    const html = renderToStaticMarkup(
      <PaperWorkSheet
        visit={visit}
        snapshot={{
          client: 'Cliente original',
          center: 'Centro original',
          address: 'Dirección original',
          tasks: 'Limpiar cristales exteriores',
          instructions: 'Usar acceso lateral',
          timeKnown: false,
          requiresAcceptance: true,
        }}
      />,
    )
    expect(html).toContain('Cliente original')
    expect(html).toContain('Centro original')
    expect(html).toContain('Dirección original')
    expect(html).not.toContain('Dirección actual')
    expect(html).toContain('13/11/2026')
    expect(html).toContain('Sin horario fijo')
    expect(html).toContain('Equipo móvil A')
    expect(html).toContain('Limpiar cristales exteriores')
    expect(html).toContain('Usar acceso lateral')
    expect(html).toContain('Firma y sello')
  })

  it('omits customer acceptance when the service does not require it', () => {
    const html = renderToStaticMarkup(
      <PaperWorkSheet visit={visit} snapshot={{ requiresAcceptance: false }} />,
    )
    expect(html).not.toContain('Firma y sello')
    expect(html).toContain('Cliente actual')
  })
})
