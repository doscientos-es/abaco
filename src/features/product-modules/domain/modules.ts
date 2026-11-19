export const coreFeatures = [
  'Clientes, centros y catálogo de productos y servicios',
  'Presupuestos, plantillas, envío y aceptación en línea',
  'Trabajos, planificación, contratos recurrentes y visitas',
  'Partes, horario personal y solicitudes de ausencia',
  'Facturas, cobros y contabilidad básica',
  'Permisos por rol y soporte por correo',
] as const

export const modules = {
  procurement: {
    name: 'Compras e inventario',
    description: 'Proveedores, stock, faltantes y preparación de pedidos de material.',
  },
  supplier_logistics: {
    name: 'Logística de proveedores',
    description: 'Solicitud de recogidas o entregas y seguimiento de la confirmación.',
  },
} as const

export type ModuleCode = keyof typeof modules

export function isModuleCode(code: string): code is ModuleCode {
  return Object.hasOwn(modules, code)
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
  monthly_cents: number
  yearly_cents: number
}
