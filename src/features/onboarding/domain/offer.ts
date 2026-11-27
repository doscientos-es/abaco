import {
  catalogQuote,
  catalogRateForCapacity,
  withModulePrice,
  type CatalogRate,
  type Interval,
} from '@/features/billing'
import type { ModuleCode, ModuleRate } from '@/features/product-modules'

export const offerModules = ['workers', 'procurement', 'ai'] as const
export type OfferModule = (typeof offerModules)[number]

export function onboardingOffer(
  catalog: readonly CatalogRate[],
  modules: readonly ModuleRate[],
  selection: readonly ModuleCode[],
  seats: number,
  period: Interval,
) {
  const rate = catalogRateForCapacity(catalog, 'standard', seats)
  if (!rate || selection.some((code) => !offerModules.some((available) => available === code)))
    return null
  const extras = [...new Set(selection)].map((code) => modules.find((item) => item.code === code))
  if (extras.some((item) => !item)) return null
  const moduleNet = extras.reduce(
    (sum, item) => sum + (item ? (period === 'year' ? item.yearly_cents : item.monthly_cents) : 0),
    0,
  )
  const base = catalogQuote(rate, period)
  const included = catalogQuote({ ...rate, seats: 1 }, period)
  return {
    terms: withModulePrice(base, moduleNet),
    baseCents: included.net_cents,
    seatsCents: base.net_cents - included.net_cents,
    extras,
  }
}

export function publicBookingUrl(value: unknown, legacyValue?: unknown): string | null {
  value = value || legacyValue
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      !['cal.com', 'cal.eu'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname.split('/').filter(Boolean).length < 2
    )
      return null
    return url.href
  } catch {
    return null
  }
}
