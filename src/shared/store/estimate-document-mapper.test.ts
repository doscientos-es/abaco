import { describe, expect, it } from 'vitest'

import type { EstimateSection } from '../domain/estimate-document'
import { estimateFromRow, estimateToRow } from './supabase-mappers'

const section: EstimateSection = {
  id: '81000000-0000-4000-8000-000000000001',
  title: 'Alcance',
  type: 'description',
  pageBreakBefore: true,
  content: 'Contenido extenso\nSegunda línea',
}
const row = { id: 'estimate', status: 'draft', estimate_lines: [], estimate_milestones: [] }

describe('estimate document persistence', () => {
  it('keeps historical rows and snapshots on the traditional layout', () => {
    const estimate = estimateFromRow(row)
    expect(estimate.documentFormat).toBe('table')
    expect(estimate.sections).toEqual([])
  })

  it('round-trips document format, section order, content and page breaks', () => {
    const estimate = estimateFromRow({
      ...row,
      document_format: 'sections',
      document_sections: [section],
    })
    expect(estimate.documentFormat).toBe('sections')
    expect(estimate.sections).toEqual([section])
    expect(estimateToRow(estimate)).toMatchObject({
      document_format: 'sections',
      document_sections: [section],
    })
  })

  it('does not silently discard malformed published content', () => {
    expect(() =>
      estimateFromRow({
        ...row,
        document_format: 'sections',
        document_sections: [{ ...section, content: null }],
      }),
    ).toThrow()
  })
})
