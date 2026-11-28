import { formLimits } from '@/shared/domain/form-limits'

import type { InvoiceCollection } from '../domain/invoice-collection'

export const invoiceTabs = ['emitidas', 'borradores', 'visitas'] as const

export type InvoiceTab = (typeof invoiceTabs)[number]

export function validateInvoicesSearch(search: Record<string, unknown>): {
  q?: string
  cobro?: Exclude<InvoiceCollection, 'todas'>
  tab?: InvoiceTab
} {
  const tab = invoiceTabs.find((candidate) => candidate === search.tab)
  const q =
    typeof search.q === 'string' && search.q !== ''
      ? search.q.slice(0, formLimits.searchQuery)
      : undefined

  const cobro = search.cobro
  return {
    ...(q ? { q } : {}),
    ...(tab ? { tab } : {}),
    ...(cobro === 'pendientes' || cobro === 'vencidas' ? { cobro } : {}),
  }
}
