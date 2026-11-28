import { describe, expect, it } from 'vitest'

import { visitDraftRanges } from './visit-draft-ranges'

describe('assignment lookups for drafts', () => {
  it('covers recently rescheduled drafts and includes known days outside the default window without redundant requests', () => {
    expect(
      visitDraftRanges(
        [undefined, '2026-09-03', '2026-09-05', '2026-09-05', '2026-11-27', '2027-02-02'],
        '2026-11-28',
      ),
    ).toEqual([
      { from: '2026-11-13', to: '2026-12-13' },
      { from: '2026-09-03', to: '2026-09-05' },
      { from: '2027-02-02', to: '2027-02-02' },
    ])
  })
})
