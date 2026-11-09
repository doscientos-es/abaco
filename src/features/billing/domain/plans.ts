/**
 * Todos los planes incluyen las mismas funciones; el catálogo orienta por tamaño y forma de
 * trabajar. Solo Autónomo, Equipo y Empresa tienen actualmente precios configurados para Redsys.
 * Los importes son en euros, sin IVA.
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
  /** Resultado principal que ayuda a identificar el tramo; no es una función exclusiva. */
  benefit: string
}

export const TRIAL_DAYS = 14
/** Personas permitidas durante la prueba. */
export const TRIAL_MEMBERS = 15
/** Maximum team size for the informational Ábaco Escala offer. */
export const MAX_SCALE_PLAN_MEMBERS = 100
export const SCALE_PLAN_MIN_MEMBERS = 16
export const SCALE_PLAN_START_MONTHLY = 57
export const SCALE_PLAN_EXTRA_MEMBER_MONTHLY = 3

export const planCatalog: readonly PlanInfo[] = [
  {
    id: 'solo',
    name: 'Autónomo',
    members: 1,
    monthly: 20,
    yearly: 200,
    audience: 'Para profesionales que llevan el negocio por su cuenta.',
    benefit: 'Lleva presupuestos, facturas y cobros en un mismo flujo.',
  },
  {
    id: 'team',
    name: 'Equipo',
    members: 5,
    monthly: 34,
    yearly: 340,
    audience: 'Para una cuadrilla que comparte la gestión del negocio.',
    benefit: 'Comparte el trabajo y asigna accesos según el rol de cada persona.',
  },
  {
    id: 'business',
    name: 'Empresa',
    members: 15,
    monthly: 54,
    yearly: 540,
    audience: 'Para una oficina que coordina varias cuadrillas.',
    benefit: 'Organiza equipos y trabajos, y consulta costes y márgenes en un mismo sitio.',
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

/** Orientative monthly list price for Ábaco Escala; this is not a Redsys checkout plan. */
export function scalePlanMonthlyPrice(members: number): number | null {
  if (
    !Number.isInteger(members) ||
    members < SCALE_PLAN_MIN_MEMBERS ||
    members > MAX_SCALE_PLAN_MEMBERS
  )
    return null
  return (
    SCALE_PLAN_START_MONTHLY + (members - SCALE_PLAN_MIN_MEMBERS) * SCALE_PLAN_EXTRA_MEMBER_MONTHLY
  )
}

/** Monthly equivalent of a yearly amount. */
export function perMonthWhenYearlyAmount(yearly: number): number {
  return Math.round((yearly / 12) * 100) / 100
}

/** Precio por mes al pagar por año. */
export function perMonthWhenYearly(plan: PlanInfo): number {
  return perMonthWhenYearlyAmount(plan.yearly)
}

export function formatEuros(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}
