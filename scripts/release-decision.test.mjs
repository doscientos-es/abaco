import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { decideRelease } from './release-decision.mjs'

describe('automatic app versioning', () => {
  it('bumps the patch when the push did not set a version manually', () => {
    expect(decideRelease('0.0.1', '0.0.1')).toEqual({ bumpPatch: true })
  })

  it.each(['0.0.2', '0.1.0', '1.0.0', '1.0.0-beta.1'])('preserves manual version %s', (version) => {
    expect(decideRelease('0.0.1', version)).toEqual({ bumpPatch: false })
  })

  it('preserves the initial version when there is no previous package manifest', () => {
    expect(decideRelease('', '0.0.1')).toEqual({ bumpPatch: false })
  })

  it.each(['', 'invalid', '01.0.0', '0.1'])('rejects invalid current version %s', (version) => {
    expect(() => decideRelease('0.0.1', version)).toThrow('not valid SemVer')
  })

  it('emits the GitHub Actions output when invoked as a CLI on any platform', () => {
    const script = fileURLToPath(new URL('./release-decision.mjs', import.meta.url))

    expect(execFileSync(process.execPath, [script, '0.0.1', '0.0.1'], { encoding: 'utf8' })).toBe(
      'bump_patch=true\n',
    )
  })
})
