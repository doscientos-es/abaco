import { describe, expect, it, vi } from 'vitest'

import {
  executeDirectoryImport,
  previewDirectory,
  suggestDirectoryMapping,
  type DirectoryDraft,
  type ExistingDirectory,
} from './directory-workbook'

const blank: ExistingDirectory = { clients: [], locations: [], clientKeys: [], locationKeys: [] }

describe('directory workbook preview', () => {
  it('keeps original lines, blocks collisions and does not match centre parents by client name', () => {
    const clients = [
      ['Reference', 'Razón social', 'CIF'],
      ['001', 'Cliente Uno', 'DEMO1'],
      [],
      ['002', 'Archivado', 'ARCH1'],
      ['003', 'Doble', ''],
      ['003', 'Otro Doble', ''],
    ]
    const centres = [
      ['ID centro', 'Centro', 'Dirección', 'ID cliente'],
      ['a1', 'Sede', 'Calle 1', '001'],
      ['a2', 'Local', 'Calle 2', 'Cliente Uno'],
      ['a3', 'Bloqueado', 'Calle 3', '002'],
    ]
    const preview = previewDirectory({
      clientKind: 'business',
      clientSheet: {
        rows: clients,
        fields: { ...suggestDirectoryMapping(clients, 'client'), key: 0 },
      },
      locationSheet: { rows: centres, fields: suggestDirectoryMapping(centres, 'location') },
      existing: {
        ...blank,
        clients: [
          {
            id: 'archive',
            name: 'Archivado',
            tax_id: 'ARCH1',
            email: '',
            archived_at: '2026-01-01',
          },
        ],
      },
    })
    expect(preview.errors).toEqual([])
    expect(preview.rows.flatMap((row) => ('draft' in row ? [row.draft] : []))).toMatchObject([
      { target: 'client', key: '001', line: 2 },
      { target: 'location', key: 'a1', line: 2, parent: { kind: 'new', sourceKey: '001' } },
    ])
    expect(preview.rows.filter((row) => 'message' in row).map(({ line }) => line)).toEqual([
      4, 5, 6, 3, 4,
    ])
  })

  it('only accepts a selected, active existing client and excludes already imported scoped IDs', () => {
    const centres = [
      ['ID centro', 'Centro', 'Dirección'],
      ['a1', 'Sede', 'Calle 1'],
      ['a2', 'Sede 2', 'Calle 2'],
    ]
    const input = {
      clientKind: '',
      locationSheet: { rows: centres, fields: suggestDirectoryMapping(centres, 'location') },
      existing: blank,
    }
    expect(previewDirectory(input).errors[0]).toContain('ID cliente')
    const parent = { kind: 'existing' as const, clientId: 'existing', name: 'Taller elegido' }
    expect(previewDirectory({ ...input, existingParent: parent }).errors[0]).toContain(
      'cliente activo',
    )
    const final = previewDirectory({
      ...input,
      existingParent: parent,
      existing: {
        ...blank,
        clients: [
          { id: 'existing', name: 'Taller elegido', tax_id: '', email: '', archived_at: null },
        ],
        locationKeys: ['a1'],
      },
    })
    expect(final.rows[0]).toMatchObject({
      line: 2,
      message: expect.stringContaining('ya importado'),
    })
    expect(final.rows[1]).toMatchObject({ line: 3, draft: { parent } })
  })

  it('writes approved clients before child rows, only uses confirmed new UUIDs, and reports unknown/untouched outcomes', async () => {
    const client = (key: string, line: number): DirectoryDraft => ({
      target: 'client',
      key,
      line,
      values: { name: key, taxId: '', email: '', kind: 'person' },
    })
    const centre = (key: string, line: number, sourceKey: string): DirectoryDraft => ({
      target: 'location',
      key,
      line,
      parent: { kind: 'new', sourceKey },
      values: { name: key, address: 'Calle 1', city: '', postalCode: '' },
    })
    const write = vi
      .fn()
      .mockResolvedValueOnce({ status: 'created', id: 'database-client' })
      .mockResolvedValueOnce({ status: 'repeated' })
      .mockRejectedValueOnce(new Error('timeout'))
    expect(
      await executeDirectoryImport(
        [
          client('a', 2),
          client('b', 3),
          centre('c', 2, 'b'),
          centre('d', 3, 'a'),
          centre('e', 4, 'a'),
        ],
        write,
      ),
    ).toEqual([
      { target: 'client', line: 2, status: 'created' },
      { target: 'client', line: 3, status: 'repeated' },
      { target: 'location', line: 2, status: 'dependency' },
      { target: 'location', line: 3, status: 'unknown' },
      { target: 'location', line: 4, status: 'not-attempted' },
    ])
    expect(write).toHaveBeenCalledTimes(3)
    expect(write.mock.calls[2]?.[1]).toBe('database-client')
  })
})
