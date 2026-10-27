import type { VisitReportData } from '../infrastructure/visit-report-repository'

export type LocalVisitReportDraft = {
  baseRevision: number
  data: VisitReportData
  operationId: string
}

const prefix = 'abaco:visit-report-draft:v1:'

export function visitReportDraftKey(userId: string, tenantId: string, visitId: string) {
  return `${prefix}${userId}:${tenantId}:${visitId}`
}

export function clearVisitReportLocalDrafts() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(prefix)) localStorage.removeItem(key)
    }
  } catch {
    // Private browsing can disable storage; the server copy remains authoritative.
  }
}

export function readVisitReportLocalDraft(key: string): LocalVisitReportDraft | null {
  try {
    const value = localStorage.getItem(key)
    if (!value) return null
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    const draft = parsed as Partial<LocalVisitReportDraft>
    if (
      !Number.isSafeInteger(draft.baseRevision) ||
      (draft.baseRevision ?? -1) < 0 ||
      typeof draft.operationId !== 'string' ||
      !draft.data ||
      typeof draft.data.notes !== 'string' ||
      (draft.data.recommendations !== undefined &&
        typeof draft.data.recommendations !== 'string') ||
      (draft.data.next_actions !== undefined && typeof draft.data.next_actions !== 'string') ||
      !Array.isArray(draft.data.checklist) ||
      draft.data.checklist.some(
        (item) =>
          !item ||
          typeof item.id !== 'string' ||
          typeof item.label !== 'string' ||
          typeof item.done !== 'boolean',
      )
    )
      return null
    return draft as LocalVisitReportDraft
  } catch {
    return null
  }
}

export function writeVisitReportLocalDraft(key: string, draft: LocalVisitReportDraft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function removeVisitReportLocalDraft(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // The draft will be ignored after the user changes identity or company.
  }
}
