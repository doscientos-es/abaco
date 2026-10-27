import { describe, expect, it } from 'vitest'

import { isCronAuthorized } from './cron-auth.ts'

const request = (headers: Record<string, string> = {}) =>
  new Request('https://example.test/cron', { method: 'POST', headers })

describe('isCronAuthorized', () => {
  it('accepts the exact secret', () => {
    expect(isCronAuthorized(request({ 'x-cron-secret': 's3cret' }), 's3cret')).toBe(true)
  })

  it('rejects a missing header, a wrong value and a different length', () => {
    expect(isCronAuthorized(request(), 's3cret')).toBe(false)
    expect(isCronAuthorized(request({ 'x-cron-secret': 'other!' }), 's3cret')).toBe(false)
    expect(isCronAuthorized(request({ 'x-cron-secret': 's3cret-longer' }), 's3cret')).toBe(false)
  })

  it('never authorizes when the configured secret is empty', () => {
    expect(isCronAuthorized(request({ 'x-cron-secret': '' }), '')).toBe(false)
  })
})
