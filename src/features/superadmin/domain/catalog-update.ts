import type { CatalogRate, PaidPlan } from '@/features/billing'
import { parseEuros } from '@/shared/domain/money'

export type CatalogUpdate = {
  plan: PaidPlan
  revision: number
  name: string
  audience: string
  benefit: string
  rates: Record<number, number>
}

export const catalogFields = [
  { name: 'name', label: 'Nombre comercial', maxLength: 60 },
  { name: 'audience', label: 'A quién va dirigido', maxLength: 240 },
  { name: 'benefit', label: 'Beneficio principal', maxLength: 240 },
] as const

export const priceField = (seats: number) => `price-${seats}`

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
    if (!value || value.length > maxLength) throw new Error(`Revisa el campo «${label}».`)
    display[name] = value
  }
  const prices: Record<number, number> = {}
  for (const rate of rates) {
    const entry = form.get(priceField(rate.seats))
    const cents = typeof entry === 'string' ? catalogMonthlyCents(entry) : null
    if (cents === null) {
      throw new Error(
        `Introduce un precio válido de 0,01 € a 10.000 € para el tramo de ${rate.seats}.`,
      )
    }
    prices[rate.seats] = cents
  }
  return { plan: first.plan, revision: first.plan_info.revision, ...display, rates: prices }
}
