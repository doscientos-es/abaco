import { paidPlans, type PaidPlan } from '@/features/billing'
import { isModuleCode, type ModuleCode } from '@/features/product-modules'

export const platformPageSize = 50
export const platformMaxPage = Math.floor(2_147_483_647 / platformPageSize) + 1
export const companySections = ['suscripcion', 'datos', 'modulos', 'pagos'] as const
export type CompanySection = (typeof companySections)[number]
export const invoiceFilters = ['issued', 'in_progress'] as const
export type InvoiceFilter = (typeof invoiceFilters)[number]

export const companyFilters = [
  { id: 'active', label: 'Activas de pago' },
  { id: 'attention', label: 'Cobro por revisar' },
  { id: 'courtesy', label: 'Cortesía' },
  { id: 'without_plan', label: 'Sin plan activo' },
  { id: 'paused', label: 'Renovación pausada' },
  { id: 'canceled', label: 'Canceladas' },
  { id: 'archived', label: 'Archivadas' },
] as const
export type CompanyFilter = (typeof companyFilters)[number]['id']
export const companyPeriods = ['month', 'year', 'none'] as const
export type CompanyPeriod = (typeof companyPeriods)[number]
export const companySorts = ['name', 'newest', 'renewal'] as const
export type CompanySort = (typeof companySorts)[number]

export const activityKinds = {
  renovacion: 'Renovación',
  archivo: 'Archivo y restauración',
  acuerdo: 'Plan y cuota',
  iva: 'IVA',
  territorio: 'Territorio fiscal',
  tarifa_plan: 'Tarifas de planes',
  tarifa_modulo: 'Tarifas de módulos',
  cortesia_modulo: 'Cortesía de módulos',
} as const
export type ActivityKind = keyof typeof activityKinds
export const maxActivityPage = 100

export type PlatformSearch = {
  vista?: 'resumen' | 'facturas' | 'planes' | 'actividad'
  accion?: ActivityKind
  estado?: CompanyFilter
  periodo?: CompanyPeriod
  orden?: CompanySort
  q?: string
  page?: number
  empresa?: string
  seccion?: CompanySection
  factura?: InvoiceFilter
  origen?: 'facturas'
  ambitoFacturas?: 'empresa'
  plan?: PaidPlan
  modulo?: ModuleCode
  referencia?: string
  edicion?: 'cuota' | 'iva' | 'plan' | 'modulo' | 'empresa'
}

export function parsePlatformSearch(raw: Record<string, unknown>): PlatformSearch {
  const q =
    typeof raw.q === 'string'
      ? raw.q.trim().slice(0, 120)
      : typeof raw.q === 'number' && Number.isSafeInteger(raw.q)
        ? String(raw.q)
        : ''
  const page = typeof raw.page === 'number' ? raw.page : 0
  const empresa =
    typeof raw.empresa === 'string' &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(raw.empresa)
      ? raw.empresa.toLowerCase()
      : undefined
  const section = companySections.find((item) => item === raw.seccion)
  const pagination = Number.isInteger(page) && page > 1 && page <= platformMaxPage ? { page } : {}
  const factura = invoiceFilters.find((filter) => filter === raw.factura)
  const reference =
    typeof raw.referencia === 'string'
      ? raw.referencia
      : typeof raw.referencia === 'number' && Number.isSafeInteger(raw.referencia)
        ? String(raw.referencia)
        : ''
  // Redsys orders start with four digits; the database enforces this format.
  const referencia = /^[0-9]{4}[a-z0-9]{4,8}$/i.test(reference) ? reference : undefined

  if (raw.vista === 'actividad') {
    const action =
      typeof raw.accion === 'string' && Object.hasOwn(activityKinds, raw.accion)
        ? (raw.accion as ActivityKind)
        : undefined
    return activitySearch(empresa, action, page)
  }
  if (raw.vista === 'resumen') return { vista: 'resumen' }
  if (raw.vista === 'planes') {
    const plan = paidPlans.find((item) => item === raw.plan)
    return plan ? planSearch(plan, raw.edicion === 'plan') : { vista: 'planes' }
  }
  if (raw.vista === 'facturas') {
    return {
      ...invoiceSearch(q, factura, pagination.page, empresa),
      ...(referencia && { referencia }),
    }
  }

  const estado =
    raw.origen === 'facturas' && empresa
      ? undefined
      : companyFilters.find(({ id }) => id === raw.estado)?.id
  const periodo =
    !empresa || raw.origen !== 'facturas'
      ? companyPeriods.find((item) => item === raw.periodo)
      : undefined
  const orden =
    !empresa || raw.origen !== 'facturas'
      ? companySorts.find((item) => item === raw.orden && item !== 'name')
      : undefined
  const modulo =
    empresa && section === 'modulos' && typeof raw.modulo === 'string' && isModuleCode(raw.modulo)
      ? raw.modulo
      : undefined
  const edicion = !empresa
    ? undefined
    : section === 'modulos'
      ? modulo && raw.edicion === 'modulo'
        ? 'modulo'
        : undefined
      : section === 'datos'
        ? raw.edicion === 'empresa'
          ? 'empresa'
          : undefined
        : section !== 'pagos' && (raw.edicion === 'cuota' || raw.edicion === 'iva')
          ? raw.edicion
          : undefined

  return {
    ...(q && { q }),
    ...pagination,
    ...(estado && { estado }),
    ...(periodo && { periodo }),
    ...(orden && { orden }),
    ...(empresa && { empresa, ...(section && section !== 'suscripcion' && { seccion: section }) }),
    ...(modulo && { modulo }),
    ...(edicion && { edicion }),
    ...(empresa &&
      raw.origen === 'facturas' && {
        origen: 'facturas',
        ...(raw.ambitoFacturas === 'empresa' && { ambitoFacturas: 'empresa' as const }),
        ...(factura && { factura }),
        ...(referencia && { referencia }),
      }),
  }
}

export function planSearch(plan: PaidPlan, editing = false): PlatformSearch {
  return { vista: 'planes', plan, ...(editing && { edicion: 'plan' }) }
}

export function companySectionSearch(
  search: PlatformSearch,
  section: CompanySection,
): PlatformSearch {
  const { edicion: _edit, modulo: _module, seccion: _section, ...company } = search
  return { ...company, ...(section !== 'suscripcion' && { seccion: section }) }
}

export function withoutEditor({ edicion: _edit, ...search }: PlatformSearch): PlatformSearch {
  return search
}

export function platformLocationKey(search: PlatformSearch): string {
  return [
    search.vista ?? 'empresas',
    search.empresa,
    search.seccion,
    search.plan,
    search.modulo,
    search.referencia,
    search.edicion,
  ].join(':')
}

export const directorySearch = ({
  q,
  page,
  estado,
  periodo,
  orden,
  vista,
  origen,
}: PlatformSearch): PlatformSearch =>
  vista || origen
    ? {}
    : {
        ...(q && { q }),
        ...(page && page > 1 && { page }),
        ...(estado && { estado }),
        ...(periodo && { periodo }),
        ...(orden && { orden }),
      }

export const invoiceSearch = (
  q: string,
  factura?: InvoiceFilter,
  page = 1,
  empresa?: string,
): PlatformSearch => ({
  vista: 'facturas',
  ...(q && { q }),
  ...(factura && { factura }),
  ...(empresa && { empresa }),
  ...(page > 1 && { page }),
})

export function companyFromInvoice(search: PlatformSearch, tenantId: string): PlatformSearch {
  const { q, page, factura, referencia } = search
  return {
    empresa: tenantId,
    seccion: 'pagos',
    origen: 'facturas',
    ...(search.vista === 'facturas' &&
      search.empresa === tenantId && { ambitoFacturas: 'empresa' as const }),
    ...(q && { q }),
    ...(page && { page }),
    ...(factura && { factura }),
    ...(referencia && { referencia }),
  }
}

export function companyBackSearch(search: PlatformSearch): PlatformSearch {
  if (search.origen !== 'facturas') return directorySearch(search)
  return {
    ...invoiceNavigation(search),
    ...(search.referencia && { referencia: search.referencia }),
  }
}

export function invoiceNavigation(search: PlatformSearch): PlatformSearch {
  return search.origen === 'facturas' || search.vista === 'facturas'
    ? invoiceSearch(
        search.q ?? '',
        search.factura,
        search.page,
        search.vista === 'facturas' || search.ambitoFacturas === 'empresa'
          ? search.empresa
          : undefined,
      )
    : { vista: 'facturas' }
}

export function activitySearch(empresa?: string, accion?: ActivityKind, page = 1): PlatformSearch {
  return {
    vista: 'actividad',
    ...(empresa && { empresa }),
    ...(accion && { accion }),
    ...(Number.isInteger(page) && page > 1 && page <= maxActivityPage && { page }),
  }
}
