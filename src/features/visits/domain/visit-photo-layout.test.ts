import { describe, expect, it } from 'vitest'

import type { VisitPhoto } from '../application/visit-photo-actions'
import { layoutVisitPhotos } from './visit-photo-layout'

function photo(id: string, phase: VisitPhoto['phase'], day: number): VisitPhoto {
  return {
    id,
    phase,
    caption: '',
    created_at: `2026-11-${day}T01:00:00Z`,
    storage_path: 'fixture-only',
    url: 'https://example.test/signed-fixture',
  }
}

describe('visit photo gallery layout', () => {
  const a = photo('a', 'before', 20)
  const b = photo('b', 'before', 21)
  const c = photo('c', 'after', 22)
  const d = photo('d', 'after', 23)
  const e = photo('e', 'other', 24)

  it('keeps phase categories and sorts without modifying the original array', () => {
    const source = [a, b, c, d, e]
    expect(layoutVisitPhotos(source, [], 'newest').unpaired).toEqual({
      before: [b, a],
      after: [d, c],
      other: [e],
    })
    expect(layoutVisitPhotos(source, [], 'oldest').unpaired).toEqual({
      before: [a, b],
      after: [c, d],
      other: [e],
    })
    expect(source).toEqual([a, b, c, d, e])
  })

  it('uses only deliberate pairs and never loses a photo for an invalid or duplicated pair', () => {
    const pairs = [
      { before_photo_id: 'a', after_photo_id: 'c', created_at: c.created_at },
      { before_photo_id: 'b', after_photo_id: 'c', created_at: b.created_at },
      { before_photo_id: 'e', after_photo_id: 'd', created_at: e.created_at },
      { before_photo_id: 'missing', after_photo_id: 'd', created_at: e.created_at },
    ]
    const layout = layoutVisitPhotos([a, b, c, d, e], pairs, 'newest')
    expect(layout.matched).toEqual([{ before: a, after: c, pair: pairs[0] }])
    expect(layout.unpaired).toEqual({ before: [b], after: [d], other: [e] })
  })
})
