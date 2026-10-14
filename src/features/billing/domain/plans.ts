/**
 * Planes. Todos incluyen lo mismo (presupuestos, facturas, clientes y catálogo ilimitados);
 * solo cambia cuántas personas forman el equipo. Precios sin IVA, en euros.
 * Los mismos números están en la base de datos (`plan_member_limit`) y en los precios de Stripe.
 */
export const paidPlans = ['solo', 'team', 'business'] as const
export type PaidPlan = (typeof paidPlans)[number]
export type Plan = PaidPlan | 'trial'
export type Interval = 'month' | 'year'

export type PlanInfo = {
  id: PaidPlan
  name: string
  members: number
  /** Euros al mes pagando mes a mes. */
  monthly: number
  /** Euros al año: dos meses gratis. */
  yearly: number
  audience: string
}

export const TRIAL_DAYS = 14
/** Personas permitidas durante la prueba. */
export const TRIAL_MEMBERS = 15

export const planCatalog: readonly PlanInfo[] = [
  { id: 'solo', name: 'Autónomo', members: 1, monthly: 20, yearly: 200, audience: 'Trabajas tú solo.' },
  { id: 'team', name: 'Equipo', members: 5, monthly: 34, yearly: 340, audience: 'Tú y tu cuadrilla, hasta 5 personas.' },
  { id: 'business', name: 'Empresa', members: 15, monthly: 54, yearly: 540, audience: 'Varias cuadrillas u oficina, hasta 15 personas.' },
]

export const includedInEveryPlan = [
  'Presupuestos y facturas ilimitados',
  'Clientes y catálogo ilimitados',
  'Envío por WhatsApp y correo',
  'Contabilidad básica',
  'Soporte por correo',
]

export function planInfo(plan: Plan): PlanInfo | null {
  return planCatalog.find((p) => p.id === plan) ?? null
}

export function memberLimit(plan: Plan): number {
  return planInfo(plan)?.members ?? TRIAL_MEMBERS
}

/** Plan más pequeño que admite a `members` personas (null si ninguno llega). */
export function smallestPlanFor(members: number): PlanInfo | null {
  return planCatalog.find((p) => p.members >= members) ?? null
}

/** Precio por mes al pagar por año. */
export function perMonthWhenYearly(plan: PlanInfo): number {
  return Math.round((plan.yearly / 12) * 100) / 100
}

export function formatEuros(value: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value)
}
