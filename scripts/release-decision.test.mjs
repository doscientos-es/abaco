import { describe, expect, it } from 'vitest'

import { releaseShouldBumpPatch } from './release-decision.mjs'

describe('release decision', () => {
  it('bumps the patch when the package version is unchanged', () => {
    expect(releaseShouldBumpPatch('0.0.20', '0.0.20')).toBe(true)
  })

  it('retains manual versions and the first identifiable version', () => {
    expect(releaseShouldBumpPatch('0.0.20', '0.1.0')).toBe(false)
    expect(releaseShouldBumpPatch('', '0.0.20')).toBe(false)
  })

  it('rejects invalid input instead of generating an invalid release', () => {
    expect(() => releaseShouldBumpPatch('0.0.20', 'latest')).toThrow()
  })
})
