export const ledgerTabs = ['resumen', 'apuntes', 'iva', 'calendario'] as const

export type LedgerTab = (typeof ledgerTabs)[number]

export function validateLedgerSearch(search: Record<string, unknown>): {
  tab?: LedgerTab
  q?: string
} {
  const tab = ledgerTabs.find((candidate) => candidate === search.tab)
  const q = typeof search.q === 'string' ? search.q.trim().slice(0, 120) : ''
  return { ...(tab ? { tab } : {}), ...(q ? { q } : {}) }
}
