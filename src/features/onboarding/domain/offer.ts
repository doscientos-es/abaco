import {
  catalogQuote,
  catalogRateForCapacity,
  withModulePrice,
  type BillingTerms,
  type CatalogRate,
  type Interval,
} from '@/features/billing'
import {
  isModuleIncludedInPlan,
  type ModuleCode,
  type ModuleRate,
} from '@/features/product-modules'

export const offerModules = ['workers', 'procurement', 'ai'] as const
export type OfferModule = (typeof offerModules)[number]

export function onboardingOffer(
  catalog: readonly CatalogRate[],
  modules: readonly ModuleRate[],
  selection: readonly ModuleCode[],
  seats: number,
  period: Interval,
  agreed?: BillingTerms,
  vatPercent?: number,
) {
  const rate = agreed ? null : catalogRateForCapacity(catalog, 'standard', seats)
  if (
    (!agreed && !rate) ||
    selection.some((code) => !offerModules.some((available) => available === code))
  )
    return null
  const extras = [...new Set(selection)]
    .filter((code) => !agreed || !isModuleIncludedInPlan(code, agreed.plan))
    .map((code) => modules.find((item) => item.code === code))
  if (extras.some((item) => !item)) return null
  const moduleNet = extras.reduce(
    (sum, item) =>
      sum +
      (item ? ((agreed?.period ?? period) === 'year' ? item.yearly_cents : item.monthly_cents) : 0),
    0,
  )
  if (agreed) {
    const base = agreed.base_net_cents ?? agreed.net_cents
    const terms = withModulePrice(
      {
        ...agreed,
        net_cents: base,
        base_net_cents: base,
        module_net_cents: 0,
        amount_cents: Math.round((base * (100 + agreed.vat_percent)) / 100),
      },
      moduleNet,
    )
    return { terms, baseCents: base, seatsCents: 0, extras }
  }
  if (!rate) return null
  const base = catalogQuote(rate, period, vatPercent)
  const included = catalogQuote({ ...rate, seats: 1 }, period, vatPercent)
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
