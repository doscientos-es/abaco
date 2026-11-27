import { readRenamedPreference } from '@/shared/lib/renamed-preference-storage'

import { resolveLedgerSummary, type LedgerSummaryLayout } from '../domain/ledger-summary-layout'

export function ledgerSummaryStorageKey(tenantId: string, userId: string): string {
  return `menoslios:ledger-summary:v1:${tenantId}:${userId}`
}

export function readLedgerSummary(key: string, canExportDatasets: boolean): LedgerSummaryLayout {
  try {
    const json =
      typeof window === 'undefined' ? null : readRenamedPreference(window.localStorage, key)
    return resolveLedgerSummary(json ? JSON.parse(json) : null, canExportDatasets)
  } catch {
    return resolveLedgerSummary(null, canExportDatasets)
  }
}

export function writeLedgerSummary(key: string, layout: LedgerSummaryLayout): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(layout))
    return true
  } catch {
    return false
  }
}
