import { readSpreadsheet } from '@/shared/lib/read-spreadsheet'

export {
  loadExistingDirectory,
  writeDirectoryWorkbookRow,
} from '../infrastructure/directory-workbook-repository'

export type DirectorySheet = { name: string; rows: string[][] }

/** All worksheet bytes stay in the browser; the RPC receives only approved mapped fields. */
export async function readDirectoryWorkbook(file: File): Promise<DirectorySheet[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error('El archivo pesa más de 5 MB.')
  if (!file.name.toLowerCase().endsWith('.xlsx'))
    return [{ name: 'CSV', rows: await readSpreadsheet(file) }]
  try {
    const { default: readWorkbook } = await import('read-excel-file/universal')
    const sheets = await readWorkbook(await file.arrayBuffer(), { trim: false })
    if (!sheets.length) throw new Error('Empty workbook')
    return sheets.map(({ sheet, data }) => ({
      name: sheet,
      rows: data.map((row) =>
        row.map((cell) =>
          cell instanceof Date
            ? cell.toISOString().slice(0, 10)
            : cell === null
              ? ''
              : String(cell),
        ),
      ),
    }))
  } catch (cause) {
    throw new Error('No se pudo leer el Excel. Usa un archivo .xlsx válido.', { cause })
  }
}
