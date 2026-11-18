export const platformPageSize = 50
export const platformMaxPage = Math.floor(2_147_483_647 / platformPageSize) + 1
export const companySections = ['suscripcion', 'modulos', 'pagos'] as const
export type CompanySection = (typeof companySections)[number]

export type PlatformSearch = {
  q?: string
  page?: number
  empresa?: string
  seccion?: CompanySection
}

export function parsePlatformSearch(raw: Record<string, unknown>): PlatformSearch {
  const q = typeof raw.q === 'string' ? raw.q.trim().slice(0, 120) : ''
  const page = typeof raw.page === 'number' ? raw.page : 0
  const empresa =
    typeof raw.empresa === 'string' &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(raw.empresa)
      ? raw.empresa.toLowerCase()
      : undefined
  const section = companySections.find((item) => item === raw.seccion)

  return {
    ...(q && { q }),
    ...(Number.isInteger(page) && page > 1 && page <= platformMaxPage && { page }),
    ...(empresa && { empresa, ...(section && section !== 'suscripcion' && { seccion: section }) }),
  }
}

export const directorySearch = ({ q, page }: PlatformSearch): PlatformSearch => ({
  ...(q && { q }),
  ...(page && page > 1 && { page }),
})
