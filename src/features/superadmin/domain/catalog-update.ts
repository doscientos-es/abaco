import type { CatalogRate, PaidPlan } from '@/features/billing'
import { parseEuros } from '@/shared/domain/money'

export type CatalogUpdate = {
  plan: PaidPlan
  revision: number
  name: string
  audience: string
  benefit: string
  rates: Record<number, number>
  seatMonthlyCents?: number
}

export const catalogFields = [
  { name: 'name', label: 'Nombre comercial', maxLength: 60, placeholder: 'Ej. Equipo' },
  {
    name: 'audience',
    label: 'A quién va dirigido',
    maxLength: 240,
    placeholder: 'Ej. Empresas con varias cuadrillas',
  },
  {
    name: 'benefit',
    label: 'Beneficio principal',
    maxLength: 240,
    placeholder: 'Ej. Coordina trabajos y materiales en un solo lugar',
  },
] as const

export const priceField = (seats: number) => `price-${seats}`
export const seatPriceField = 'seat-price'

export class CatalogFieldError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message)
  }
}

export function catalogMonthlyCents(raw: string): number | null {
  const value = raw.trim()
  if (!/^\d{1,5}([,.]\d{1,2})?$/.test(value)) return null
  const cents = parseEuros(value)
  return cents >= 1 && cents <= 1_000_000 ? cents : null
}

export function readCatalogUpdate(form: FormData, rates: readonly CatalogRate[]): CatalogUpdate {
  const first = rates[0]
  if (!first?.plan_info) throw new Error('Recarga el catálogo antes de guardar.')
  const display = { name: '', audience: '', benefit: '' }
  for (const { name, label, maxLength } of catalogFields) {
    const entry = form.get(name)
    const value = typeof entry === 'string' ? entry.trim() : ''
    if (!value || value.length > maxLength) {
      throw new CatalogFieldError(name, `Introduce «${label}» (máximo ${maxLength} caracteres).`)
    }
    display[name] = value
  }
  const prices: Record<number, number> = {}
  for (const rate of rates) {
    const entry = form.get(priceField(rate.seats))
    const cents = typeof entry === 'string' ? catalogMonthlyCents(entry) : null
    if (cents === null) {
      throw new CatalogFieldError(
        priceField(rate.seats),
        `Introduce un precio de 0,01 € a 10.000 € para el tramo de ${rate.seats}, con hasta dos decimales.`,
      )
    }
    prices[rate.seats] = cents
  }
  let seatMonthlyCents: number | undefined
  if (first.plan === 'scale') {
    const entry = form.get(seatPriceField)
    const parsedSeatPrice = catalogMonthlyCents(typeof entry === 'string' ? entry : '')
    if (parsedSeatPrice === null) {
      throw new CatalogFieldError(seatPriceField, 'Introduce un precio por plaza válido.')
    }
    seatMonthlyCents = parsedSeatPrice
  }
  return {
    plan: first.plan,
    revision: first.plan_info.revision,
    ...display,
    rates: prices,
    ...(seatMonthlyCents === undefined ? {} : { seatMonthlyCents }),
  }
}
