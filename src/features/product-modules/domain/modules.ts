export const coreFeatures = [
  'Clientes, centros y catálogo de productos y servicios',
  'Presupuestos, plantillas, envío y aceptación en línea',
  'Trabajos, planificación, contratos recurrentes y visitas',
  'Partes, horario personal y solicitudes de ausencia',
  'Facturas, cobros y contabilidad básica',
  'Permisos por rol y soporte por correo',
] as const

export const modules = {
  ai: {
    name: 'Asistente de IA',
    description:
      'Ayuda a preparar presupuestos para una persona administradora; 500 peticiones al mes.',
    includedIn: [],
  },
  workers: {
    name: 'Trabajadores',
    description: 'Funciones, horarios, datos personales, documentos y ausencias del equipo.',
    includedIn: ['trial', 'team', 'business', 'scale'],
  },
  procurement: {
    name: 'Proveedores',
    description: 'Proveedores, compras, stock, faltantes y preparación de pedidos de material.',
    includedIn: ['business', 'scale'],
  },
  supplier_logistics: {
    name: 'Logística de proveedores',
    description: 'Solicitud de recogidas o entregas y seguimiento de la confirmación.',
    includedIn: ['business', 'scale'],
  },
  mcp: {
    name: 'MCP',
    description: 'Conexión de Ábaco con asistentes y herramientas compatibles con MCP.',
    includedIn: ['scale'],
  },
} as const

export type ModuleCode = keyof typeof modules

export function isModuleCode(code: string): code is ModuleCode {
  return Object.hasOwn(modules, code)
}

export function isModuleIncludedInPlan(code: ModuleCode, plan: string): boolean {
  return (modules[code].includedIn as readonly string[]).includes(plan)
}

export function moduleNetForPlan(
  plan: string,
  period: 'month' | 'year',
  subscriptions: readonly ModuleSubscription[],
): number {
  return subscriptions.reduce((total, subscription) => {
    if (
      subscription.gifted ||
      isModuleIncludedInPlan(subscription.module_code, plan) ||
      !(subscription.next_enabled ?? subscription.enabled)
    ) {
      return total
    }
    return total + (period === 'year' ? subscription.yearly_cents : subscription.monthly_cents)
  }, 0)
}

export type ModuleRate = {
  code: ModuleCode
  monthly_cents: number
  yearly_cents: number
}

export type ModuleSubscription = {
  module_code: ModuleCode
  enabled: boolean
  next_enabled: boolean | null
  gifted: boolean
  monthly_cents: number
  yearly_cents: number
}
