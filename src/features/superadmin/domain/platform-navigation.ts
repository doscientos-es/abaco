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

  if (raw.vista === 'planes') return { vista: 'planes' }
  if (raw.vista === 'facturas') return invoiceSearch(q, factura, pagination.page)

  return {
    ...(q && { q }),
    ...pagination,
    ...(empresa && { empresa, ...(section && section !== 'suscripcion' && { seccion: section }) }),
    ...(empresa &&
      raw.origen === 'facturas' && {
        origen: 'facturas',
        ...(factura && { factura }),
      }),
  }
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
