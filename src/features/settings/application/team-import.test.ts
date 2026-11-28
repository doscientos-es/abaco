import { describe, expect, it, vi } from 'vitest'

import { readSpreadsheetSheets } from '@/shared/lib/read-spreadsheet'

import {
  previewTeamImport,
  sendTeamInvitations,
  suggestTeamImportMapping,
  teamImportHeaders,
  type ReadyTeamImportRow,
} from './team-import'

describe('importación de personas', () => {
  async function readCsv(text: string) {
    const [sheet] = await readSpreadsheetSheets(new File([text], 'personas.csv'))
    if (!sheet) throw new Error('Missing CSV sheet')
    return sheet.rows
  }

  it('maps positional custom headers and excludes identifiable DNI and phone columns', async () => {
    const table = await readCsv(
      '\nPersona;Identidad corporativa;Nivel;DNI;Teléfono\nAlicia;A@EXAMPLE.TEST;;009988;00111',
    )
    expect(teamImportHeaders(table)).toEqual({
      headerRow: 1,
      headers: [
        { index: 0, label: 'Persona' },
        { index: 1, label: 'Identidad corporativa' },
        { index: 2, label: 'Nivel' },
      ],
    })
    expect(suggestTeamImportMapping(table)).toEqual({})
    expect(previewTeamImport(table, { Correo: 1, Nombre: 0, Rol: 2 }, [])).toEqual({
      rows: [
        {
          line: 3,
          status: 'ready',
          invitation: { email: 'a@example.test', fullName: 'Alicia', role: 'user' },
        },
      ],
    })
    expect(previewTeamImport(table, { Correo: 1, Nombre: 3 }, [])).toEqual({
      fatal: 'Una columna elegida no es válida.',
    })
  })

  it('does not silently choose a repeated alias or map one column twice', () => {
    const table = [
      ['Correo', 'Email', 'Nombre'],
      ['a@example.test', 'b@example.test', 'Ana'],
    ]
    expect(suggestTeamImportMapping(table)).toEqual({ Nombre: 2 })
    expect(previewTeamImport(table, { Nombre: 2 }, [])).toEqual({
      fatal: 'Elige la columna del correo.',
    })
    expect(previewTeamImport(table, { Correo: 1, Nombre: 1 }, [])).toEqual({
      fatal: 'Usa una columna distinta para cada campo.',
    })
  })

  it('excludes all ambiguous duplicate rows and returns precise errors with source row numbers', async () => {
    const table = await readCsv(
      'Correo;Nombre;Rol\nANA@example.test;Ana;\nana@example.test;Ana;Administrador\n\nbad;X;Usuario\nluis@example.test;Luis;Administrador\nother@example.test;Eva;owner\nok@example.test;Eva;',
    )
    expect(
      previewTeamImport(table, suggestTeamImportMapping(table), ['LUIS@example.test']),
    ).toEqual({
      rows: [
        { line: 2, status: 'duplicate', message: 'El correo se repite en la hoja.' },
        { line: 3, status: 'duplicate', message: 'El correo se repite en la hoja.' },
        { line: 5, status: 'invalid', message: 'Correo no válido.' },
        { line: 6, status: 'duplicate', message: 'La persona ya pertenece al equipo.' },
        { line: 7, status: 'invalid', message: 'El rol debe ser Usuario o Administrador.' },
        {
          line: 8,
          status: 'ready',
          invitation: { email: 'ok@example.test', fullName: 'Eva', role: 'user' },
        },
      ],
    })
  })

  it('reports each actual invite/added/uncertain/skipped/not-attempted result without automatic retry', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 'invited' })
      .mockResolvedValueOnce({ ok: true, status: 'added' })
      .mockRejectedValueOnce(new Error('network'))
    const rows: ReadyTeamImportRow[] = ['skip', 'email', 'added', 'unknown', 'unsent'].map(
      (email, index) => ({
        line: index + 2,
        status: 'ready',
        invitation: { email: `${email}@example.test`, fullName: '', role: 'user' },
      }),
    )
    await expect(sendTeamInvitations(rows, ['SKIP@example.test'], send)).resolves.toEqual([
      { line: 2, status: 'skipped', message: 'La persona ya pertenece al equipo.' },
      { line: 3, status: 'invited' },
      { line: 4, status: 'added' },
      { line: 5, status: 'unconfirmed', message: 'Se perdió la respuesta del servidor.' },
      { line: 6, status: 'not-attempted' },
    ])
    expect(send).toHaveBeenCalledTimes(3)
  })
})
