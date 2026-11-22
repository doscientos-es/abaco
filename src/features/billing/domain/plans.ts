/**
 * Todos los planes comparten el núcleo; el catálogo orienta por tamaño del equipo.
 * Sales prices come from the public billing catalogue in Supabase.
 */
export const paidPlans = ['solo', 'team', 'business', 'scale', 'standard'] as const
export type PaidPlan = (typeof paidPlans)[number]
export type Plan = PaidPlan | 'trial'
export type Interval = 'month' | 'year'
export type FixedBillingPrice = { period: Interval; netCents: number }

export type PlanInfo = {
  id: PaidPlan
  name: string
  audience: string
  /** Resultado principal que ayuda a identificar el tramo; no es una función exclusiva. */
  benefit: string
}

export const TRIAL_DAYS = 14
/** Personas permitidas durante la prueba. */
export const TRIAL_MEMBERS = 15
export const MAX_SCALE_PLAN_MEMBERS = 200
export const SCALE_PLAN_MIN_MEMBERS = 16

export const planCatalog: readonly PlanInfo[] = [
  {
    id: 'standard',
    name: 'Ábaco',
    audience: 'Para profesionales y equipos de cualquier tamaño.',
    benefit: 'El mismo núcleo para todos, con módulos opcionales por empresa.',
  },
  {
    id: 'solo',
    name: 'Autónomo',
    audience: 'Para profesionales que llevan el negocio por su cuenta.',
    benefit: 'Lleva presupuestos, facturas y cobros en un mismo flujo.',
  },
  {
    id: 'team',
    name: 'Equipo pequeño',
    audience: 'Para equipos de hasta 5 personas con acceso.',
    benefit: 'Comparte el trabajo e incluye las herramientas para coordinar trabajadores.',
  },
  {
    id: 'business',
    name: 'Equipo grande',
    audience: 'Para equipos de hasta 15 personas con acceso.',
    benefit: 'Organiza equipos y trabajos, y consulta costes y márgenes en un mismo sitio.',
  },
  {
    id: 'scale',
    name: 'Enterprise',
    audience: 'Para empresas con 16 o más personas con acceso.',
    benefit: 'Todo incluido, con un precio transparente por cada plaza del equipo.',
  },
]

export function planInfo(plan: string, rates?: readonly CatalogRate[]): PlanInfo | null {
  const fallback = planCatalog.find((p) => p.id === plan)
  if (!fallback) return null
  const display = rates?.find((rate) => rate.plan === plan)?.plan_info
  return display ? { ...display, id: fallback.id } : fallback
}

export function planLabel(plan: string, rates?: readonly CatalogRate[]): string {
  return plan === 'trial' ? 'Prueba' : (planInfo(plan, rates)?.name ?? plan)
}

export type CatalogRate = {
  plan: PaidPlan
  seats: number
  monthly_cents: number
  yearly_cents: number
  seat_monthly_cents?: number
  vat_percent: number
  plan_info?: (Omit<PlanInfo, 'id'> & { revision: number }) | null
}

export type BillingTerms = {
  plan: PaidPlan
  period: Interval
  seats: number
  net_cents: number
  amount_cents: number
  vat_percent: number
  base_net_cents?: number
  module_net_cents?: number
}

export const STANDARD_BILLING_VAT = 21
export const billingVatLabel = (vatPercent: number) =>
  vatPercent === 0 ? 'sin IVA (0 %)' : 'con IVA'

export function withModulePrice(terms: BillingTerms, moduleCents: number): BillingTerms {
  if (!moduleCents) return terms
  const net = terms.net_cents + moduleCents
  return {
    ...terms,
    base_net_cents: terms.net_cents,
    module_net_cents: moduleCents,
    net_cents: net,
    amount_cents: Math.round((net * (100 + terms.vat_percent)) / 100),
  }
}

export function catalogQuote(
  rate: CatalogRate,
  period: Interval,
  vatPercent = rate.vat_percent,
  fixedNetCents?: number,
): BillingTerms {
  const perSeat =
    rate.plan === 'standard'
      ? (rate.seat_monthly_cents ?? 0) * (rate.seats - 1)
      : rate.plan === 'scale'
        ? (rate.seat_monthly_cents ?? 0) * rate.seats
        : 0
  const net =
    fixedNetCents ??
    (period === 'year'
      ? rate.yearly_cents + perSeat * (rate.plan === 'standard' ? 12 : 10)
      : rate.monthly_cents + perSeat)
  return {
    plan: rate.plan,
    seats: rate.seats,
    period,
    net_cents: net,
    amount_cents: Math.round((net * (100 + vatPercent)) / 100),
    vat_percent: vatPercent,
  }
}

export function smallestRateFor(
  rates: readonly CatalogRate[],
  members: number,
): CatalogRate | null {
  if (!Number.isInteger(members) || members < 1) return null
  const standard = rates.find((rate) => rate.plan === 'standard')
  if (standard && members <= MAX_SCALE_PLAN_MEMBERS) return { ...standard, seats: members }
  if (members >= SCALE_PLAN_MIN_MEMBERS && members <= MAX_SCALE_PLAN_MEMBERS) {
    const enterprise = rates.find((rate) => rate.plan === 'scale')
    if (enterprise) return { ...enterprise, seats: members }
  }
  return rates.reduce<CatalogRate | null>(
    (best, rate) => (rate.seats >= members && (!best || rate.seats < best.seats) ? rate : best),
    null,
  )
}

export function catalogRateForCapacity(
  rates: readonly CatalogRate[],
  plan: PaidPlan,
  seats: number,
): CatalogRate | null {
  if (plan === 'standard') {
    const standard = rates.find((rate) => rate.plan === 'standard')
    return standard && Number.isInteger(seats) && seats >= 1 && seats <= MAX_SCALE_PLAN_MEMBERS
      ? { ...standard, seats }
      : null
  }
  if (plan === 'scale') {
    const enterprise = rates.find((rate) => rate.plan === 'scale')
    return enterprise && seats >= SCALE_PLAN_MIN_MEMBERS && seats <= MAX_SCALE_PLAN_MEMBERS
      ? { ...enterprise, seats }
      : null
  }
  return rates.find((rate) => rate.plan === plan && rate.seats === seats) ?? null
}

export function sameCapacity(a: CatalogRate | null, b: CatalogRate | null): boolean {
  return a !== null && b !== null && a.plan === b.plan && a.seats === b.seats
}

export function formatEuros(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}
