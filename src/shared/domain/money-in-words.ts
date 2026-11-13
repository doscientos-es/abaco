const small = [
  'cero',
  'un',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiún',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
]
const tens = [
  '',
  '',
  '',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa',
]
const hundreds = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
]

/** Masculine, apocopated cardinals for monetary units (un euro, veintiún céntimos). */
function cardinal(value: number): string {
  if (value < 30) return small[value] ?? ''
  if (value < 100) {
    const rest = value % 10
    return `${tens[Math.floor(value / 10)]}${rest ? ` y ${cardinal(rest)}` : ''}`
  }
  if (value === 100) return 'cien'
  if (value < 1000) {
    const rest = value % 100
    return `${hundreds[Math.floor(value / 100)]}${rest ? ` ${cardinal(rest)}` : ''}`
  }
  for (const [scale, singular, plural] of [
    [1_000_000_000_000, 'un billón', 'billones'],
    [1_000_000, 'un millón', 'millones'],
    [1000, 'mil', 'mil'],
  ] as const) {
    if (value < scale) continue
    const group = Math.floor(value / scale)
    const rest = value % scale
    return `${group === 1 ? singular : `${cardinal(group)} ${plural}`}${rest ? ` ${cardinal(rest)}` : ''}`
  }
  return ''
}

/** Integer cents only: avoids floating-point decimals in legal price wording. */
export function eurosInWords(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new RangeError('El importe debe ser un número entero de céntimos no negativo.')
  const euros = Math.floor(cents / 100)
  const remainder = cents % 100
  const unit =
    euros === 1 ? 'euro' : euros >= 1_000_000 && euros % 1_000_000 === 0 ? 'de euros' : 'euros'
  const fraction = remainder
    ? ` con ${cardinal(remainder)} ${remainder === 1 ? 'céntimo' : 'céntimos'}`
    : ''
  return `${cardinal(euros)} ${unit}${fraction}`.toLocaleUpperCase('es-ES')
}
