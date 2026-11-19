/**
 * Todos los planes comparten el núcleo; el catálogo orienta por tamaño del equipo.
 * Sales prices come from the public billing catalogue in Supabase.
 */
export const paidPlans = ['solo', 'team', 'business', 'scale'] as const
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
    id: 'solo',
    name: 'Autónomo',
    audience: 'Para profesionales que llevan el negocio por su cuenta.',
    benefit: 'Lleva presupuestos, facturas y cobros en un mismo flujo.',
  },
  {
    id: 'team',
    name: 'Equipo',
    audience: 'Para una cuadrilla que comparte la gestión del negocio.',
    benefit: 'Comparte el trabajo y asigna accesos según el rol de cada persona.',
  },
  {
    id: 'business',
    name: 'Empresa',
    audience: 'Para una oficina que coordina varias cuadrillas.',
    benefit: 'Organiza equipos y trabajos, y consulta costes y márgenes en un mismo sitio.',
  },
  {
    id: 'scale',
    name: 'Escala',
    audience: 'Para empresas de 16 a 200 personas con acceso.',
    benefit: 'Elige la capacidad que necesitas para operar con varias cuadrillas.',
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
  const net = fixedNetCents ?? (period === 'year' ? rate.yearly_cents : rate.monthly_cents)
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
  return rates.reduce<CatalogRate | null>(
    (best, rate) => (rate.seats >= members && (!best || rate.seats < best.seats) ? rate : best),
    null,
  )
}

export function formatEuros(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}
