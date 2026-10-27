import { describe, expect, it } from 'vitest'

import { publicPhotoReferences, publicVisitReportSnapshot } from './public-visit-report'

describe('public visit report projection', () => {
  it('exposes customer fields and omits internal IDs, costs and storage paths', () => {
    const snapshot = {
      company: { id: 'private-company-id', name: 'Piscinas Sur', margin: 42 },
      client: { id: 'private-client-id', name: 'Comunidad Azul', email: 'private@example.test' },
      visit: {
        id: 'private-visit-id',
        title: 'Revisión semanal',
        actual_start_at: '2026-10-23T08:00:00Z',
        work_order_id: 'private-work-id',
      },
      report: {
        data: {
          notes: 'Agua clara',
          recommendations: 'Revisar filtro',
          next_actions: 'Volver en siete días',
          checklist: [{ id: 'private-task-id', label: 'Filtro', done: true }],
        },
      },
      measurements: [
        {
          id: 'private-reading-id',
          label: 'pH',
          value: 7.2,
          unit: 'pH',
          assessment: 'within',
          cost_cents: 900,
        },
      ],
      activities: [
        {
          kind: 'product',
          description: 'Ajuste',
          quantity: 1,
          unit: 'kg',
          internal_cost_cents: 1500,
        },
      ],
      incidents: [{ title: 'Bomba', diagnosis: 'internal-diagnosis', resolution: 'Reparada' }],
      photos: [{ storage_path: 'private-storage-path', phase: 'after', caption: 'Resultado' }],
      billing: { total_cents: 99999 },
    }
    const projected = publicVisitReportSnapshot(snapshot, 1, '2026-10-23T09:00:00Z', [
      { phase: 'after', caption: 'Resultado', url: 'https://example.test/signed' },
    ])
    expect(projected.report.notes).toBe('Agua clara')
    expect(projected.measurements[0]?.value).toBe(7.2)
    expect(projected.photos[0]?.url).toBe('https://example.test/signed')
    expect(JSON.stringify(projected)).not.toMatch(/private-|cost_cents|margin|billing|diagnosis/)
    expect(publicPhotoReferences(snapshot)).toEqual([
      { storagePath: 'private-storage-path', phase: 'after', caption: 'Resultado' },
    ])
  })

  it('returns safe empty values for malformed optional sections', () => {
    const projected = publicVisitReportSnapshot({}, 1, '2026-10-23T09:00:00Z', [])
    expect(projected.report.checklist).toEqual([])
    expect(projected.measurements).toEqual([])
    expect(projected.location).toBeNull()
    expect(projected.photos).toEqual([])
  })
})
