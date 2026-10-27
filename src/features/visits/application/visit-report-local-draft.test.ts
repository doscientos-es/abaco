import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearVisitReportLocalDrafts,
  readVisitReportLocalDraft,
  visitReportDraftKey,
  writeVisitReportLocalDraft,
} from './visit-report-local-draft'

describe('visit report recovery', () => {
  const values = new Map<string, string>()
  beforeEach(() => {
    values.clear()
    vi.stubGlobal('localStorage', {
      get length() {
        return values.size
      },
      key(index: number) {
        return [...values.keys()][index] ?? null
      },
      getItem(key: string) {
        return values.get(key) ?? null
      },
      setItem(key: string, value: string) {
        values.set(key, value)
      },
      removeItem(key: string) {
        values.delete(key)
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('scopes a recovered draft to the signed in user, company and visit', () => {
    const key = visitReportDraftKey('user-a', 'tenant-a', 'visit-a')
    const draft = {
      baseRevision: 3,
      data: {
        notes: 'Trabajo pendiente',
        checklist: [{ id: 'check-a', label: 'Comprobar bomba', done: false }],
      },
      operationId: 'operation-a',
    }
    expect(writeVisitReportLocalDraft(key, draft)).toBe(true)
    expect(readVisitReportLocalDraft(key)).toEqual(draft)
    expect(
      readVisitReportLocalDraft(visitReportDraftKey('user-b', 'tenant-a', 'visit-a')),
    ).toBeNull()
    expect(
      readVisitReportLocalDraft(visitReportDraftKey('user-a', 'tenant-b', 'visit-a')),
    ).toBeNull()
    expect(
      readVisitReportLocalDraft(visitReportDraftKey('user-a', 'tenant-a', 'visit-b')),
    ).toBeNull()
  })

  it('clears sensitive drafts on sign out without deleting other application keys', () => {
    values.set('unrelated', 'keep')
    writeVisitReportLocalDraft(visitReportDraftKey('user-a', 'tenant-a', 'visit-a'), {
      baseRevision: 0,
      data: { notes: '', checklist: [] },
      operationId: 'operation-a',
    })
    clearVisitReportLocalDrafts()
    expect(values.get('unrelated')).toBe('keep')
    expect(values.size).toBe(1)
  })
})
