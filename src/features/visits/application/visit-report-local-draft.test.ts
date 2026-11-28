import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearVisitReportLocalDrafts,
  equalVisitReportData,
  listVisitReportLocalDrafts,
  readVisitReportLocalDraft,
  removeVisitReportLocalDraft,
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

  it('indexes legacy and dated drafts only inside the active scope', () => {
    const draft = { baseRevision: 0, data: { notes: '', checklist: [] }, operationId: 'operation' }
    writeVisitReportLocalDraft(visitReportDraftKey('a', 'b', 'recent'), {
      ...draft,
      visitDay: '2026-11-27',
    })
    writeVisitReportLocalDraft(visitReportDraftKey('a', 'b', 'legacy'), draft)
    writeVisitReportLocalDraft(visitReportDraftKey('a', 'b', 'invalid'), {
      ...draft,
      visitDay: '2026-02-31',
    })
    writeVisitReportLocalDraft(visitReportDraftKey('another', 'b', 'ignore'), draft)
    writeVisitReportLocalDraft(visitReportDraftKey('a', 'another', 'ignore'), draft)
    values.set(visitReportDraftKey('a', 'b', 'corrupt'), '{')
    expect(listVisitReportLocalDrafts('a', 'b')).toEqual([
      { visitId: 'recent', day: '2026-11-27' },
      { visitId: 'legacy', day: undefined },
      { visitId: 'invalid', day: undefined },
    ])
  })

  it('leaves newer changes from another tab alone when removing an already saved draft', () => {
    const key = visitReportDraftKey('a', 'b', 'recent')
    writeVisitReportLocalDraft(key, {
      baseRevision: 0,
      data: { notes: 'Newer', checklist: [] },
      operationId: 'newer',
    })
    removeVisitReportLocalDraft(key, 'old')
    expect(readVisitReportLocalDraft(key)?.data.notes).toBe('Newer')
    removeVisitReportLocalDraft(key, 'newer')
    expect(readVisitReportLocalDraft(key)).toBeNull()
  })

  it('matches PostgreSQL reordered JSON and preserves checklist order and real edits', () => {
    const first = { id: 'one', label: 'Uno', done: true }
    const second = { id: 'two', label: 'Dos', done: false }
    const local = { notes: '', recommendations: '', checklist: [first, second] }
    expect(
      equalVisitReportData(local, {
        checklist: [{ done: true, label: 'Uno', id: 'one' }, second],
        notes: '',
      }),
    ).toBe(true)
    expect(equalVisitReportData(local, { ...local, next_actions: 'Llamar' })).toBe(false)
    expect(equalVisitReportData(local, { ...local, checklist: [second, first] })).toBe(false)
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
