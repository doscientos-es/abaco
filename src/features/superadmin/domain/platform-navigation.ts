import { paidPlans, type PaidPlan } from '@/features/billing'
import { isModuleCode, type ModuleCode } from '@/features/product-modules'

export const platformPageSize = 50
export const platformMaxPage = Math.floor(2_147_483_647 / platformPageSize) + 1
export const companySections = ['suscripcion', 'modulos', 'pagos'] as const
export type CompanySection = (typeof companySections)[number]
export const invoiceFilters = ['issued', 'in_progress'] as const
export type InvoiceFilter = (typeof invoiceFilters)[number]

export type PlatformSearch = {
  vista?: 'facturas' | 'planes'
  q?: string
  page?: number
  empresa?: string
  seccion?: CompanySection
  factura?: InvoiceFilter
  origen?: 'facturas'
  plan?: PaidPlan
  modulo?: ModuleCode
  referencia?: string
  edicion?: 'cuota' | 'iva' | 'plan' | 'modulo'
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

  if (raw.vista === 'planes') {
    const plan = paidPlans.find((item) => item === raw.plan)
    return plan ? planSearch(plan, raw.edicion === 'plan') : { vista: 'planes' }
  }
  if (raw.vista === 'facturas') {
    const referencia =
      typeof raw.referencia === 'string' && /^[a-z0-9-]{4,40}$/i.test(raw.referencia)
        ? raw.referencia
        : undefined
    return { ...invoiceSearch(q, factura, pagination.page), ...(referencia && { referencia }) }
  }

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
      : section !== 'pagos' && (raw.edicion === 'cuota' || raw.edicion === 'iva')
        ? raw.edicion
        : undefined

  return {
    ...(q && { q }),
    ...pagination,
    ...(empresa && { empresa, ...(section && section !== 'suscripcion' && { seccion: section }) }),
    ...(modulo && { modulo }),
    ...(edicion && { edicion }),
    ...(empresa &&
      raw.origen === 'facturas' && {
        origen: 'facturas',
        ...(factura && { factura }),
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

export const directorySearch = ({ q, page, vista, origen }: PlatformSearch): PlatformSearch =>
  vista || origen ? {} : { ...(q && { q }), ...(page && page > 1 && { page }) }

export const invoiceSearch = (q: string, factura?: InvoiceFilter, page = 1): PlatformSearch => ({
  vista: 'facturas',
  ...(q && { q }),
  ...(factura && { factura }),
  ...(page > 1 && { page }),
})

export function companyFromInvoice(search: PlatformSearch, tenantId: string): PlatformSearch {
  const { q, page, factura } = search
  return {
    empresa: tenantId,
    seccion: 'pagos',
    origen: 'facturas',
    ...(q && { q }),
    ...(page && { page }),
    ...(factura && { factura }),
  }
}

export function invoiceNavigation(search: PlatformSearch): PlatformSearch {
  return search.origen === 'facturas' || search.vista === 'facturas'
    ? invoiceSearch(search.q ?? '', search.factura, search.page)
    : { vista: 'facturas' }
}
