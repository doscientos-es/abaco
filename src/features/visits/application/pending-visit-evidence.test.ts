import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fieldEntryQueueKey,
  writeFieldEntryQueue,
} from '@/features/field-entries/application/field-entry-queue'
import {
  visitIncidentQueueKey,
  writeVisitIncidentQueue,
} from '@/features/incidents/application/incident-queue'

import { listLocalVisitEvidence, visitEvidenceAnchor } from './pending-visit-evidence'
import { countPendingVisitPhotos } from './visit-photo-queue'

vi.mock('./visit-photo-queue', () => ({ countPendingVisitPhotos: vi.fn() }))

describe('pending evidence overview', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('merges counts for only the active user and company without exposing payloads', async () => {
    const values = new Map<string, string>()
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
    })
    const incident = {
      operationId: 'inc',
      title: 'Private title',
      description: 'Private notes',
      priority: 'normal' as const,
    }
    const activity = {
      operationId: 'activity',
      description: 'Private asset',
      kind: 'labor' as const,
      quantity: 1,
      unit: 'h',
      occurredAt: '2026-11-22T10:00:00Z',
      supersedesId: null,
    }
    const user = 'active'
    const company = 'current'
    writeVisitIncidentQueue(visitIncidentQueueKey(user, company, 'first'), [incident])
    writeVisitIncidentQueue(visitIncidentQueueKey('other', company, 'first'), [incident])
    writeFieldEntryQueue(fieldEntryQueueKey(user, 'external', 'second'), [activity])
    writeFieldEntryQueue(fieldEntryQueueKey(user, company, 'first'), [activity])
    values.set(fieldEntryQueueKey(user, company, 'damaged'), '{')
    vi.mocked(countPendingVisitPhotos).mockResolvedValue(
      new Map([
        ['first', 2],
        ['third', 1],
      ]),
    )

    const result = await listLocalVisitEvidence(user, company)
    expect(result.unavailable).toEqual([])
    expect([...result.byVisit]).toEqual([
      ['first', { photos: 2, incidents: 1, activity: 1 }],
      ['third', { photos: 1 }],
    ])
    expect(countPendingVisitPhotos).toHaveBeenCalledWith(user, company)
    expect(visitEvidenceAnchor('first', 'photos')).toBe('worker-evidence-photos-first')
  })

  it('reports unavailable storage instead of claiming no evidence is pending', async () => {
    vi.stubGlobal('localStorage', {
      get length() {
        throw new Error('Storage denied')
      },
    })
    vi.mocked(countPendingVisitPhotos).mockRejectedValue(new Error('IndexedDB denied'))
    const result = await listLocalVisitEvidence('active', 'current')
    expect(result.unavailable).toEqual(['photos', 'incidents', 'activity'])
    expect(result.byVisit.size).toBe(0)
  })
})
