/** Allow one explicit decimal separator; never coerce empty or ambiguous input to 0. */
export function parseMeasurementValue(input: string): number | null {
  const trimmed = input.trim()
  if (!/^-?\d+(?:[.,]\d{1,3})?$/.test(trimmed)) return null
  const value = Number(trimmed.replace(',', '.'))
  return Number.isFinite(value) && Math.abs(value) <= 100_000 ? value : null
}
