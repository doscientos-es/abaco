import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { WorkerVisitArrival } from './worker-visit-arrival'

describe('worker arrival card', () => {
  it('groups permitted location data and passes only the address to the external map', () => {
    const source = {
      title: 'Revisión de equipo',
      locationName: 'Centro Cervera',
      clientName: 'Cliente & Cía',
      address: '  C/ Peñón 4, Ávila & Norte  ',
      access_notes: 'PIN de acceso de la oficina',
      operational_contact: '600000001',
      parking_notes: 'Indicaciones internas',
    }
    const html = renderToStaticMarkup(<WorkerVisitArrival {...source} />)
    expect(html).toContain('Ficha de llegada')
    expect(html).toContain('Centro Cervera')
    expect(html).toContain('Cliente: Cliente &amp; Cía')
    expect(html).toContain('destination=C%2F+Pe%C3%B1%C3%B3n+4%2C+%C3%81vila+%26+Norte')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('Copiar dirección')
    expect(html).not.toMatch(/PIN de acceso|600000001|Indicaciones internas|tel:/)
  })

  it('does not offer copy or map links without an address even if a client label exists', () => {
    const html = renderToStaticMarkup(
      <WorkerVisitArrival title="Revisión" locationName=" " clientName="Cliente" address={null} />,
    )
    expect(html).toContain('No hay un centro indicado.')
    expect(html).toContain('Sin dirección de visita.')
    expect(html).toContain('Cliente: Cliente')
    expect(html).not.toMatch(/Copiar dirección|https:\/\/www.google.com\/maps/)
  })
})
