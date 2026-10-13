import type { Cents } from './types'

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export function formatEuros(cents: Cents): string {
  return eur.format(cents / 100)
}

/** Parses "1.234,56", "12,5" or "12.5" into cents. Returns 0 for invalid input. */
export function parseEuros(input: string): Cents {
  const trimmed = input.trim().replace(/\s/g, '')
  if (!trimmed) return 0
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed
  const value = Number(normalized)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

export function centsToInput(cents: Cents): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

/** Plain decimal with dot, for CSV exports. */
export function centsToPlain(cents: Cents): string {
  return (cents / 100).toFixed(2)
}

export function lineTotal(quantity: number, unitPriceCents: Cents): Cents {
  return Math.round(quantity * unitPriceCents)
}

export function applyRate(cents: Cents, ratePercent: number): Cents {
  return Math.round((cents * ratePercent) / 100)
}
