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
const WINDOWS_1252_C1 =
  '\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u008D\u017D\u008F\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178'

function decodeWindows1252(buffer: ArrayBuffer): string {
  const decoded = new TextDecoder('windows-1252').decode(buffer)
  // Node 22.13-22.18 maps windows-1252 0x80-0x9F as raw Latin-1 controls (nodejs/node#56542).
  let out = ''
  let last = 0
  for (let i = 0; i < decoded.length; i++) {
    const code = decoded.charCodeAt(i)
    if (code >= 0x80 && code <= 0x9f) {
      out += decoded.slice(last, i) + WINDOWS_1252_C1[code - 0x80]
      last = i + 1
    }
  }
  return last === 0 ? decoded : out + decoded.slice(last)
}

function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return decodeWindows1252(buffer)
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
