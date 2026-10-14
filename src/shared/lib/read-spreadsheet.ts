import { parseDelimited } from '../domain/table-import'

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Reads a `.xlsx` or `.csv` file into rows of text cells, with no external library:
 * an .xlsx is a zip of XML files, which the browser can open with `DecompressionStream`.
 * Only the first sheet is read, and formulas come as the value Excel last calculated.
 */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (file.size > MAX_BYTES) throw new Error('El archivo pesa más de 5 MB.')
  const buffer = await file.arrayBuffer()
  const name = file.name.toLowerCase()
  if (name.endsWith('.xls')) throw new Error('Los .xls antiguos no se pueden leer. Guárdalo como .xlsx o CSV.')
  const isZip = new DataView(buffer).byteLength > 3 && new DataView(buffer).getUint32(0, true) === 0x04034b50
  if (name.endsWith('.xlsx') || isZip) return readXlsx(buffer)
  return parseDelimited(decodeText(buffer))
}

/** Excel on Windows saves CSV in windows-1252; anything that is not valid UTF-8 is read that way. */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

type ZipFiles = Map<string, () => Promise<string>>

function openZip(buffer: ArrayBuffer): ZipFiles {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  let end = bytes.length - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0) throw new Error('El archivo no es un Excel válido.')
  const count = view.getUint16(end + 10, true)
  let pointer = view.getUint32(end + 16, true)
  const files: ZipFiles = new Map()
  for (let i = 0; i < count; i++) {
    if (view.getUint32(pointer, true) !== 0x02014b50) break
    const method = view.getUint16(pointer + 10, true)
    const size = view.getUint32(pointer + 20, true)
    const nameLength = view.getUint16(pointer + 28, true)
    const extraLength = view.getUint16(pointer + 30, true)
    const commentLength = view.getUint16(pointer + 32, true)
    const local = view.getUint32(pointer + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength))
    files.set(name, async () => {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
      const data = bytes.slice(start, start + size)
      if (method === 0) return new TextDecoder().decode(data)
      if (method !== 8) throw new Error('El Excel usa una compresión no admitida.')
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return new TextDecoder().decode(await new Response(stream).arrayBuffer())
    })
    pointer += 46 + nameLength + extraLength + commentLength
  }
  return files
}

const parseXml = (text: string) => new DOMParser().parseFromString(text, 'application/xml')

function columnIndex(reference: string): number {
  let index = 0
  for (const char of reference.replace(/[0-9]/g, '')) index = index * 26 + char.charCodeAt(0) - 64
  return index - 1
}

async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const files = openZip(buffer)
  const sheetName = files.has('xl/worksheets/sheet1.xml')
    ? 'xl/worksheets/sheet1.xml'
    : [...files.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0]
  const sheetFile = sheetName ? files.get(sheetName) : undefined
  if (!sheetFile) throw new Error('No se encontró ninguna hoja en el Excel.')

  const sharedFile = files.get('xl/sharedStrings.xml')
  const shared = sharedFile
    ? [...parseXml(await sharedFile()).getElementsByTagName('si')].map((si) =>
        [...si.getElementsByTagName('t')]
          .filter((t) => t.parentElement?.localName !== 'rPh')
          .map((t) => t.textContent ?? '')
          .join(''),
      )
    : []

  const rows: string[][] = []
  for (const rowNode of parseXml(await sheetFile()).getElementsByTagName('row')) {
    const cells: string[] = []
    for (const cell of rowNode.getElementsByTagName('c')) {
      const reference = cell.getAttribute('r')
      const index = reference ? columnIndex(reference) : cells.length
      const type = cell.getAttribute('t')
      const raw = cell.getElementsByTagName('v')[0]?.textContent ?? ''
      let value = raw
      if (type === 's') value = shared[Number(raw)] ?? ''
      else if (type === 'inlineStr') value = cell.getElementsByTagName('t')[0]?.textContent ?? ''
      else if (type === 'b') value = raw === '1' ? 'Sí' : 'No'
      else if (type !== 'str' && raw !== '' && Number.isFinite(Number(raw))) value = String(Number(raw))
      while (cells.length < index) cells.push('')
      cells[index] = value
    }
    const rowIndex = Number(rowNode.getAttribute('r')) - 1
    while (rows.length < rowIndex) rows.push([])
    rows[rowIndex >= 0 ? rowIndex : rows.length] = cells
  }
  return rows
}
