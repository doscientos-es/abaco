import { describe, expect, it } from 'vitest'

import { projectVisitCalendarDetails } from './rich-event'

const details = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  visitId: '20000000-0000-4000-8000-000000000001',
  start: new Date('2026-10-24T22:30:00Z'),
  timeZone: 'Europe/Madrid',
  appUrl: 'https://app.example.test',
  title: 'Limpieza',
  clientName: 'Comunidad Norte',
  locationName: 'Piscina',
  address: 'Calle Uno 2',
  postalCode: '08001',
  city: 'Barcelona',
  notes: 'Llamar al llegar\nNo usar <producto>',
  assignees: ['Ana', 'Luis & María'],
}

describe('rich Google Calendar details', () => {
  it('projects only the requested details and a local-day link', () => {
    const input = { ...details, hidden: 'do not send' }
    const result = projectVisitCalendarDetails(input)
    expect(result.summary).toBe('Limpieza · Comunidad Norte')
    expect(result.location).toBe('Piscina, Calle Uno 2, 08001 Barcelona')
    expect(result.description).toContain('Personas asignadas: Ana, Luis &amp; María')
    expect(result.description).toContain('Llamar al llegar<br>No usar &lt;producto&gt;')
    expect(result.description).toContain('fecha=2026-10-25')
    expect(result.description).toContain('empresa=10000000-0000-4000-8000-000000000001')
    expect(result.description).toContain('visita=20000000-0000-4000-8000-000000000001')
    expect(JSON.stringify(result)).not.toContain('do not send')
  })

  it('escapes user content and requires a trusted https link', () => {
    const result = projectVisitCalendarDetails({
      ...details,
      assignees: ['<script>alert(1)</script>'],
      notes: '<a href="https://bad.test">test</a>',
    })
    expect(result.description).not.toContain('<script>')
    expect(result.description).not.toContain('<a href="https://bad.test">')
    expect(() => projectVisitCalendarDetails({ ...details, appUrl: 'http://app.test' })).toThrow()
    expect(() =>
      projectVisitCalendarDetails({ ...details, appUrl: 'https://user@app.test' }),
    ).toThrow()
    expect(() => projectVisitCalendarDetails({ ...details, tenantId: 'invalid' })).toThrow(
      'identity',
    )
  })

  it('handles missing optional content without empty labels', () => {
    const result = projectVisitCalendarDetails({
      ...details,
      notes: '',
      assignees: [],
      address: '',
      city: '',
      postalCode: '',
    })
    expect(result.location).toBe('Piscina')
    expect(result.description).not.toContain('Notas:')
    expect(result.description).not.toContain('Personas asignadas:')
  })
})
