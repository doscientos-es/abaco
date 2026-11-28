import { calendarDate, dateValue } from '@/shared/lib/date-range'

import type { VisitReportData } from '../infrastructure/visit-report-repository'

export type LocalVisitReportDraft = {
  baseRevision: number
  data: VisitReportData
  operationId: string
  visitDay?: string
  delivery?: 'queued'
}

const prefix = 'abaco:visit-report-draft:v1:'
const changedEvent = 'menoslios:visit-report-drafts-changed'

export function validDraftVisitDay(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    dateValue(calendarDate(value)) === value
  )
}

function notifyDraftChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(changedEvent))
}

export function listenToVisitReportLocalDrafts(onChange: () => void) {
  function onStorage({ key }: StorageEvent) {
    if (key === null || key.startsWith(prefix)) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(changedEvent, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(changedEvent, onChange)
  }
}

export function listVisitReportLocalDrafts(userId: string, tenantId: string) {
  const scope = visitReportDraftKey(userId, tenantId, '')
  const drafts: { visitId: string; day: string | undefined; delivery?: 'queued' }[] = []
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(scope)) continue
      const visitId = key.slice(scope.length)
      if (!visitId) continue
      const draft = readVisitReportLocalDraft(key)
      if (draft)
        drafts.push({
          visitId,
          day: validDraftVisitDay(draft.visitDay) ? draft.visitDay : undefined,
          ...(draft.delivery === 'queued' ? { delivery: draft.delivery } : {}),
        })
    }
  } catch {
    // Storage may be unavailable; never infer pending work from browser failures.
  }
  return drafts
}

/** PostgreSQL jsonb may reorder object keys; optional blank text is equivalent to missing text. */
export function equalVisitReportData(left: VisitReportData, right: VisitReportData) {
  return (
    left.notes === right.notes &&
    (left.recommendations ?? '') === (right.recommendations ?? '') &&
    (left.next_actions ?? '') === (right.next_actions ?? '') &&
    left.checklist.length === right.checklist.length &&
    left.checklist.every((item, index) => {
      const other = right.checklist[index]
      return other && item.id === other.id && item.label === other.label && item.done === other.done
    })
  )
}

export function visitReportDraftKey(userId: string, tenantId: string, visitId: string) {
  return `${prefix}${userId}:${tenantId}:${visitId}`
}

export function clearVisitReportLocalDrafts() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(prefix)) localStorage.removeItem(key)
    }
    notifyDraftChange()
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
      typeof draft.baseRevision !== 'number' ||
      !Number.isSafeInteger(draft.baseRevision) ||
      (draft.baseRevision ?? -1) < 0 ||
      typeof draft.operationId !== 'string' ||
      (draft.delivery !== undefined && draft.delivery !== 'queued') ||
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
    return {
      baseRevision: draft.baseRevision,
      operationId: draft.operationId,
      ...(validDraftVisitDay(draft.visitDay) ? { visitDay: draft.visitDay } : {}),
      ...(draft.delivery === 'queued' ? { delivery: draft.delivery } : {}),
      data: {
        notes: draft.data.notes,
        ...(draft.data.recommendations !== undefined
          ? { recommendations: draft.data.recommendations }
          : {}),
        ...(draft.data.next_actions !== undefined ? { next_actions: draft.data.next_actions } : {}),
        checklist: draft.data.checklist.map(({ id, label, done }) => ({ id, label, done })),
      },
    }
  } catch {
    return null
  }
}

export function writeVisitReportLocalDraft(key: string, draft: LocalVisitReportDraft) {
  try {
    const previous = readVisitReportLocalDraft(key)
    localStorage.setItem(key, JSON.stringify(draft))
    if (!previous || previous.delivery !== draft.delivery || previous.visitDay !== draft.visitDay)
      notifyDraftChange()
    return true
  } catch {
    return false
  }
}

export function removeVisitReportLocalDraft(key: string, expectedOperationId?: string) {
  try {
    if (expectedOperationId && readVisitReportLocalDraft(key)?.operationId !== expectedOperationId)
      return
    const existed = localStorage.getItem(key) !== null
    localStorage.removeItem(key)
    if (existed) notifyDraftChange()
  } catch {
    // The draft will be ignored after the user changes identity or company.
  }
}
