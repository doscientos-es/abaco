/**
 * Planes. Todos incluyen lo mismo (presupuestos, facturas, clientes y catálogo ilimitados);
 * solo cambia cuántas personas forman el equipo. Precios sin IVA, en euros.
 * Los límites y precios se reflejan en la base de datos (`plan_member_limit` y `plan_price_cents`);
 * el cobro se tramita con Redsys.
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
  {
    id: 'solo',
    name: 'Autónomo',
    members: 1,
    monthly: 20,
    yearly: 200,
    audience: 'Gestionas tú los presupuestos y cobros.',
  },
  {
    id: 'team',
    name: 'Equipo',
    members: 5,
    monthly: 34,
    yearly: 340,
    audience: 'Trabajas con una cuadrilla.',
  },
  {
    id: 'business',
    name: 'Empresa',
    members: 15,
    monthly: 54,
    yearly: 540,
    audience: 'Coordinas varias cuadrillas y la oficina.',
  },
]

export const includedInEveryPlan = [
  'Presupuestos y facturas ilimitados',
  'Clientes y catálogo ilimitados',
  'Envío por WhatsApp y correo',
  'Aceptación o rechazo desde el enlace del cliente',
  'Seguimiento de facturas y cobros pendientes',
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
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}
