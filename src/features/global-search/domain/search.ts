import { fuzzySearch, normalizeSearchText } from '@/shared/domain/fuzzy-search'
import type { TenantData } from '@/shared/domain/types'

export type SearchTarget =
  | {
      to:
        | '/'
        | '/clientes'
        | '/clientes/nuevo'
        | '/presupuestos'
        | '/facturas'
        | '/contratos'
        | '/trabajos'
        | '/trabajadores'
        | '/catalogo'
        | '/contabilidad'
        | '/ajustes'
        | '/personalizar'
        | '/superadmin'
        | '/mi-jornada'
        | '/horarios'
        | '/mis-vacaciones'
        | '/vacaciones'
    }
  | { to: '/clientes/$clientId'; params: { clientId: string } }
  | { to: '/presupuestos/$estimateId'; params: { estimateId: string } }
  | { to: '/facturas/$invoiceId'; params: { invoiceId: string } }
  | { to: '/contratos/$contractId'; params: { contractId: string } }
  | { to: '/trabajos/$workOrderId'; params: { workOrderId: string } }
  | { to: '/trabajadores'; search: { persona: string } | { equipo: string } }
  | { to: '/catalogo'; search: { q: string } }
  | { to: '/contabilidad'; search: { tab: 'apuntes'; q: string } }

export type SearchItem = {
  id: string
  title: string
  category: string
  keywords?: string
  target: SearchTarget
  shortcut?: string
}

/** Never index snapshots, public-link tokens, private notes or another company's records. */
export function businessSearchItems(data: TenantData): SearchItem[] {
  const companyId = data.tenant.id
  const clients = new Map(
    data.clients.filter((item) => item.tenantId === companyId).map((item) => [item.id, item.name]),
  )
  return [
    ...data.clients
      .filter((item) => item.tenantId === companyId && !item.archivedAt)
      .map((item): SearchItem => ({
        id: `client:${item.id}`,
        title: item.name,
        category: 'Clientes',
        keywords: `${item.email} ${item.phone} ${item.taxId}`,
        target: { to: '/clientes/$clientId', params: { clientId: item.id } },
      })),
    ...data.estimates
      .filter((item) => item.tenantId === companyId)
      .map((item): SearchItem => ({
        id: `estimate:${item.id}`,
        title: `${item.number} · ${item.title}`,
        category: 'Presupuestos',
        keywords: clients.get(item.clientId) ?? '',
        target: { to: '/presupuestos/$estimateId', params: { estimateId: item.id } },
      })),
    ...data.invoices
      .filter((item) => item.tenantId === companyId)
      .map((item): SearchItem => ({
        id: `invoice:${item.id}`,
        title: `${item.number} · ${item.concept}`,
        category: 'Facturas',
        keywords: clients.get(item.clientId) ?? '',
        target: { to: '/facturas/$invoiceId', params: { invoiceId: item.id } },
      })),
    ...data.ledger
      .filter((item) => item.tenantId === companyId)
      .map((item): SearchItem => ({
        id: `ledger:${item.id}`,
        title: item.concept,
        category: 'Contabilidad',
        keywords: `${item.category} ${item.date} ${item.kind === 'income' ? 'ingreso' : 'gasto'}`,
        target: { to: '/contabilidad', search: { tab: 'apuntes', q: item.concept } },
      })),
    ...data.catalog
      .filter((item) => item.tenantId === companyId)
      .map((item): SearchItem => ({
        id: `catalog:${item.id}`,
        title: item.name,
        category: 'Catálogo',
        keywords: `${item.sku} ${item.category}`,
        target: { to: '/catalogo', search: { q: item.sku || item.name } },
      })),
  ]
}

/** Rank exact names and references first, while keeping a bounded, diverse result list. */
export function searchItems(items: SearchItem[], query: string, perCategory = 5): SearchItem[] {
  const term = normalizeSearchText(query)
  if (!term)
    return items.filter((item) => item.category === 'Navegación' || item.category === 'Acciones')
  const counts = new Map<string, number>()
  return items
    .filter((item) => fuzzySearch(query, item.title, item.category, item.keywords ?? ''))
    .map((item, index) => ({
      item,
      index,
      score:
        normalizeSearchText(item.title) === term
          ? 0
          : normalizeSearchText(item.title).startsWith(term)
            ? 1
            : normalizeSearchText(`${item.title} ${item.keywords ?? ''}`).includes(term)
              ? 2
              : 3,
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ item }) => item)
    .filter((item) => {
      const count = counts.get(item.category) ?? 0
      counts.set(item.category, count + 1)
      return count < perCategory
    })
    .slice(0, 40)
}
