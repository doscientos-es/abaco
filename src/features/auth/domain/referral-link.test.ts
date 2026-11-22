import { describe, expect, it } from 'vitest'

import { referralCodeFromSearch, referralLink } from './referral-link'

describe('referral links', () => {
  it('accepts only a well-formed referral code and normalizes its case', () => {
    expect(referralCodeFromSearch('?r=ab12cd34ef56ab78')).toBe('AB12CD34EF56AB78')
    expect(referralCodeFromSearch('?r=invalid')).toBeNull()
    expect(referralCodeFromSearch('?r=AB12CD34EF56AB78%26other=x')).toBeNull()
  })

  it('builds a shareable registration URL with an encoded referral parameter', () => {
    expect(referralLink('https://abaco.example', 'AB12CD34EF56AB78')).toBe(
      'https://abaco.example/registro?r=AB12CD34EF56AB78',
    )
  })
})
