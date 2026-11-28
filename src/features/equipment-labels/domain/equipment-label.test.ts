import { describe, expect, it } from 'vitest'

import { equipmentActivityLabel, equipmentScanUrl, tagFromFragment } from './equipment-label'

const tag = 'ab730000-0000-4000-8000-000000000001'
describe('opaque equipment label route', () => {
  it('carries only an opaque UUID in a same-site fragment', () => {
    const link = new URL(equipmentScanUrl('https://app.menoslios.com', tag) ?? '')
    expect(link.pathname).toBe('/equipo-qr')
    expect(link.search).toBe('')
    expect(tagFromFragment(link.hash)).toBe(tag)
    expect(tagFromFragment(tag.toUpperCase())).toBe(tag)
    expect(tagFromFragment('#/clientes/private')).toBeNull()
    expect(equipmentScanUrl('https://app.menoslios.com', tag + '?cliente=1')).toBeNull()
  })

  it('never renders backend text as an activity label', () => {
    expect(
      equipmentActivityLabel({
        type: 'incident',
        date: '2026-11-28',
        status: 'closed with private note',
      }),
    ).toBeNull()
    expect(
      equipmentActivityLabel({ type: 'incident', date: '2026-11-28', status: 'constructor' }),
    ).toBeNull()
    expect(
      equipmentActivityLabel({ type: 'incident', date: '2026-11-28', status: 'resolved' }),
    ).toBe('Incidencia resuelta')
  })
})
