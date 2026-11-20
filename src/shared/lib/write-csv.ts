import Papa from 'papaparse'

/** Writes the format expected by Spanish Excel and the existing accounting exports. */
export function writeCsv(fields: string[], data: string[][]): string {
  const csv = Papa.unparse(
    { fields, data },
    {
      delimiter: ';',
      newline: '\r\n',
      // Keep plain negative amounts numeric, but escape text that could be read as a formula.
      escapeFormulae: /^(?!-\d+\.\d{2}$)(?:[\t\r\n]|\s*[=+@-])/,
    },
  )
  return `\uFEFF${csv}\r\n`
}
