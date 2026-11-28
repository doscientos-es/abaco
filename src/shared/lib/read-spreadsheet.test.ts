import { describe, expect, it } from 'vitest'

import encodedWorkbook from './fixtures/import-workbook.json'
import { readSpreadsheet, readSpreadsheetSheets } from './read-spreadsheet'

describe('readSpreadsheet', () => {
  it('reads a UTF-8 CSV with BOM, quoted delimiters, escaped quotes and multiline cells', async () => {
    const csv = '\uFEFF\r\n"Código,,,";Detalle;Total\r\n00123;"Dijo ""sí"";\r\nluego";12,50\r\n'

    await expect(readSpreadsheet(new File([csv], 'datos.CSV'))).resolves.toEqual([
      [''],
      ['Código,,,', 'Detalle', 'Total'],
      ['00123', 'Dijo "sí";\r\nluego', '12,50'],
    ])
  })

  it.each([',', '\t'])('reads %j as a delimiter without dropping blank rows', async (separator) => {
    const text = `Código${separator}Nota\n\n00007${separator}ok\n00008\n`

    await expect(readSpreadsheet(new File([text], 'datos.txt'))).resolves.toEqual([
      ['Código', 'Nota'],
      [''],
      ['00007', 'ok'],
      ['00008'],
    ])
  })

  it('reads Windows-1252 exports without replacing accents or the euro sign', async () => {
    const bytes = Uint8Array.from(Buffer.from('Descripción;Total\nMálaga;12,50\x80', 'latin1'))

    await expect(readSpreadsheet(new File([bytes], 'datos.csv'))).resolves.toEqual([
      ['Descripción', 'Total'],
      ['Málaga', '12,50€'],
    ])
  })

  it('uses workbook sheet order and reads dates, cached values and sparse cells as text', async () => {
    // The first tab points to sheet2.xml; sheet1.xml is an unrelated second tab.
    const workbook = Buffer.from(encodedWorkbook.join(''), 'base64')

    await expect(readSpreadsheet(new File([workbook], 'apuntes.xlsx'))).resolves.toEqual([
      ['Fecha', 'Tipo', 'Concepto', 'Total', 'Confirmado', 'Referencia'],
      ['', '', '', '', '', ''],
      ['2026-03-15', 'Gasto', 'Compra', '12.5', 'Sí', '00123'],
      ['2026-03-15', '', '', '', 'No', ''],
    ])
  })

  it('exposes every named XLSX sheet in workbook order for an explicit local selection', async () => {
    const workbook = Buffer.from(encodedWorkbook.join(''), 'base64')
    const sheets = await readSpreadsheetSheets(new File([workbook], 'seleccion.xlsx'))
    expect(sheets).toHaveLength(2)
    expect(sheets[0]?.name).not.toEqual(sheets[1]?.name)
    expect(sheets[0]?.rows[0]?.[0]).toBe('Fecha')
    expect(sheets[1]?.rows).not.toEqual(sheets[0]?.rows)
    expect(
      await readSpreadsheetSheets(new File(['Correo\na@example.test'], 'personas.csv')),
    ).toEqual([{ name: 'CSV', rows: [['Correo'], ['a@example.test']] }])
  })

  it.each([
    ['documento.xls', '', 'Los .xls antiguos no se pueden leer.'],
    ['documento.xlsx', 'no es un Excel', 'El archivo no es un Excel válido.'],
    ['datos.csv', 'Código;Nota\n01;"sin cerrar', 'El CSV tiene un formato no válido en la fila 2.'],
  ])('reports a readable error for invalid input in %s', async (name, contents, message) => {
    await expect(readSpreadsheet(new File([contents], name))).rejects.toThrow(message)
  })

  it('rejects files over 5 MB before reading', async () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'datos.csv')
    await expect(readSpreadsheet(file)).rejects.toThrow('El archivo pesa más de 5 MB.')
  })
})
