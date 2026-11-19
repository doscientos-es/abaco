import type { CellValue } from 'read-excel-file/universal'

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Return text cells for the shared import schemas. Read only the first Excel sheet,
 * using saved formula results without evaluating formulas.
 */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (file.size > MAX_BYTES) throw new Error('El archivo pesa más de 5 MB.')
  const name = file.name.toLowerCase()
  if (name.endsWith('.xls'))
    throw new Error('Los .xls antiguos no se pueden leer. Guárdalo como .xlsx o CSV.')
  const buffer = await file.arrayBuffer()
  const isZip = buffer.byteLength >= 4 && new DataView(buffer).getUint32(0, true) === 0x04034b50
  if (name.endsWith('.xlsx') || isZip) return readXlsx(buffer)
  return readCsv(decodeText(buffer))
}

/** Excel on Windows saves CSV in windows-1252; anything that is not valid UTF-8 is read that way. */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const { InvalidInputError, SheetNotFoundError, readSheet } =
    await import('read-excel-file/universal')
  try {
    const rows = await readSheet(buffer, 1, { trim: false })
    return rows.map((row) => row.map(cellText))
  } catch (error) {
    if (error instanceof SheetNotFoundError) {
      throw new Error('No se encontró ninguna hoja en el Excel.', { cause: error })
    }
    if (error instanceof InvalidInputError && error.code === 'XLS_FILE_NOT_SUPPORTED') {
      throw new Error('Los .xls antiguos no se pueden leer. Guárdalo como .xlsx o CSV.', {
        cause: error,
      })
    }
    throw new Error('El archivo no es un Excel válido.', { cause: error })
  }
}

function cellText(value: CellValue | null): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  return value === null ? '' : String(value)
}

async function readCsv(text: string): Promise<string[][]> {
  const { default: papa } = await import('papaparse')
  // Choose a delimiter using the first nonempty record, not the data: later rows may
  // omit optional cells or contain decimal commas. Keep empty rows in the final parse.
  let delimiter = ';'
  let width = 1
  for (const candidate of [';', ',', '\t']) {
    papa.parse<string[]>(text, {
      delimiter: candidate,
      skipEmptyLines: 'greedy',
      step({ data, errors }, parser) {
        if (errors.length === 0 && data.length > width) {
          delimiter = candidate
          width = data.length
        }
        parser.abort()
      },
    })
  }
  const { data, errors, meta } = papa.parse<string[]>(text, { delimiter })
  const error = errors[0]
  if (error) {
    const location = error.row === undefined ? '' : ` en la fila ${error.row + 1}`
    throw new Error(
      `El CSV tiene un formato no válido${location}. Revisa las comillas y vuelve a intentarlo.`,
    )
  }
  // Papa Parse emits an extra empty record for a terminal line break.
  if (text.endsWith(meta.linebreak)) data.pop()
  return data
}
