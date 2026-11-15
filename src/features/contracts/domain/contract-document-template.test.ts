import { describe, expect, it } from 'vitest'

import {
  contractDocumentSectionsSchema,
  snapshotLibraryTemplate,
} from './contract-document-template'

describe('biblioteca de plantillas', () => {
  it('compone una copia ordenada, conserva texto anterior y distingue Markdown', () => {
    const sections = [
      {
        id: 'a',
        title: 'A',
        content: '**texto**',
        page_break_before: false,
        format: 'plain' as const,
        revision: 1,
      },
      {
        id: 'b',
        title: 'B',
        content: '**otro**',
        page_break_before: true,
        format: 'markdown' as const,
        revision: 2,
      },
    ]
    const snapshot = snapshotLibraryTemplate(
      {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Contrato',
        before_ids: ['b', 'a'],
        after_ids: [],
        revision: 1,
      },
      sections,
    )
    expect(contractDocumentSectionsSchema.parse(snapshot)).toEqual({
      before: [
        { id: 'b', title: 'B', content: '**otro**', pageBreakBefore: true, format: 'markdown' },
        { id: 'a', title: 'A', content: '**texto**', pageBreakBefore: false },
      ],
      after: [],
    })
    const originalSection = sections[0]
    if (!originalSection) throw new Error('Falta la sección de prueba')
    originalSection.content = 'cambiado'
    expect(snapshot.before[1]?.content).toBe('**texto**')
  })

  it('rechaza referencias a secciones que ya no existen', () => {
    expect(() =>
      snapshotLibraryTemplate(
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Contrato',
          before_ids: ['missing'],
          after_ids: [],
          revision: 1,
        },
        [],
      ),
    ).toThrow('Falta una sección')
  })
})
