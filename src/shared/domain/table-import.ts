/**
 * Generic table import (Excel/CSV). A schema says which columns a table accepts; this module
 * reads the rows against it. A file whose headers do not match is rejected whole (`fatal`).
 * Rows with bad values are skipped one by one and reported, never half-imported.
 */
export type ImportColumn = {
  label: string
  /** Other header names accepted for the same column (compared without case, accents or symbols). */
  aliases?: string[]
  required?: boolean
  /** Plain-words rule shown to the user and copied into the ChatGPT prompt. */
  hint: string
  example: string
}

export type RowResult<T> = { ok: true; value: T } | { ok: false; error: string }

export type ImportSchema<T> = {
  singular: string
  plural: string
  columns: ImportColumn[]
  /** Receives the cells by column label ('' when empty). */
  parse(row: Record<string, string>): RowResult<T>
  /** Rows sharing any key with an existing or earlier row are skipped as duplicates. */
  duplicateKeys(value: T): string[]
}

export type ImportPlan<T> =
  | { fatal: string }
  | { valid: T[]; duplicates: number; errors: { line: number; message: string }[] }

export const MAX_IMPORT_ROWS = 5000

export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function detectDelimiter(firstLine: string): string {
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length] as const)
  return counts.reduce((best, c) => (c[1] > best[1] ? c : best))[0]
}

/** Reads CSV text (quotes, `;` `,` or tab separators, BOM) into rows of cells. */
export function parseDelimited(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i)
    if (quoted) {
      if (char !== '"') cell += char
      else if (text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (char === '"' && cell === '') quoted = true
    else if (char === delimiter) endCell()
    else if (char === '\n') endRow()
    else if (char !== '\r') cell += char
  }
  if (cell !== '' || row.length > 0) endRow()
  return rows
}

export function planImport<T>(
  table: string[][],
  schema: ImportSchema<T>,
  existingKeys: Set<string>,
): ImportPlan<T> {
  const lines = table.map((cells, index) => ({
    cells: cells.map((c) => c.trim()),
    line: index + 1,
  }))
  const nonEmpty = lines.filter((l) => l.cells.some(Boolean))
  const header = nonEmpty[0]
  if (!header) return { fatal: 'El archivo está vacío.' }

  const position = new Map<string, number>()
  const missing: string[] = []
  for (const column of schema.columns) {
    const names = [column.label, ...(column.aliases ?? [])].map(normalizeHeader)
    const index = header.cells.findIndex((cell) => names.includes(normalizeHeader(cell)))
    if (index >= 0) position.set(column.label, index)
    else if (column.required) missing.push(column.label)
  }
  if (missing.length > 0) {
    return {
      fatal: `Faltan columnas obligatorias: ${missing.join(', ')}. La primera fila debe tener las cabeceras.`,
    }
  }

  const body = nonEmpty.slice(1)
  if (body.length === 0) return { fatal: 'El archivo solo tiene la fila de cabeceras, sin datos.' }
  if (body.length > MAX_IMPORT_ROWS)
    return { fatal: `El archivo tiene más de ${MAX_IMPORT_ROWS} filas. Divídelo en varios.` }

  const seen = new Set(existingKeys)
  const valid: T[] = []
  const errors: { line: number; message: string }[] = []
  let duplicates = 0
  for (const { cells, line } of body) {
    const row: Record<string, string> = {}
    for (const column of schema.columns) {
      const index = position.get(column.label)
      row[column.label] = index === undefined ? '' : (cells[index] ?? '')
    }
    const result = schema.parse(row)
    if (!result.ok) {
      errors.push({ line, message: result.error })
      continue
    }
    const keys = schema.duplicateKeys(result.value)
    if (keys.some((key) => seen.has(key))) {
      duplicates++
      continue
    }
    for (const key of keys) seen.add(key)
    valid.push(result.value)
  }
  return { valid, duplicates, errors }
}

const quote = (value: string) => (/[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/** Header plus one example row, ready to open in Excel. */
export function buildTemplateCsv(schema: ImportSchema<unknown>): string {
  const header = schema.columns.map((c) => quote(c.label)).join(';')
  const example = schema.columns.map((c) => quote(c.example)).join(';')
  return `\uFEFF${header}\r\n${example}\r\n`
}

/** Text to paste into ChatGPT together with the user's own Excel so it comes back in our format. */
export function buildAiPrompt(schema: ImportSchema<unknown>): string {
  const columns = schema.columns
    .map(
      (c) =>
        `- ${c.label} (${c.required ? 'obligatoria' : 'opcional'}): ${c.hint} Ejemplo: ${c.example}`,
    )
    .join('\n')
  const header = schema.columns.map((c) => c.label).join(';')
  const example = schema.columns.map((c) => c.example).join(';')
  return [
    `Te adjunto mi Excel con ${schema.plural}. Conviértelo al formato exacto que necesita mi programa de gestión para importarlos.`,
    '',
    'Reglas:',
    '- Respóndeme solo con el resultado final en un archivo CSV descargable, sin explicaciones.',
    `- Una fila por ${schema.singular}. Quita filas vacías, de totales y de títulos.`,
    '- Separador punto y coma (;), codificación UTF-8, sin celdas combinadas ni fórmulas.',
    `- La primera fila son las cabeceras, EXACTAMENTE así y en este orden: ${header}`,
    '- Si un dato no existe en mi Excel, deja la celda vacía. Nunca inventes datos.',
    '- Importes con coma decimal y sin separador de miles ni símbolo de moneda.',
    '',
    'Columnas:',
    columns,
    '',
    'Ejemplo del formato (cabecera y una fila):',
    header,
    example,
  ].join('\n')
}
