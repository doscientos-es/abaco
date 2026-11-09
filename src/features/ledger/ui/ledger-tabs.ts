export const ledgerTabs = ['resumen', 'apuntes', 'iva', 'calendario'] as const

export type LedgerTab = (typeof ledgerTabs)[number]

export function validateLedgerSearch(search: Record<string, unknown>): { tab?: LedgerTab } {
  const tab = ledgerTabs.find((candidate) => candidate === search.tab)
  return tab ? { tab } : {}
}
