import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { buildReplayPlan, prepareReplay } from './prepare-db-replay.mjs'

const migrations = readdirSync(
  fileURLToPath(new URL('../supabase/migrations', import.meta.url)),
).filter((file) => file.endsWith('.sql'))
const admin = '20261110130000_admin_absence_management.sql'
const types = '20261110180807_absence_request_types.sql'
const followup = '20261110180842_absence_information_followup.sql'

describe('disposable database replay plan', () => {
  it('applies every migration exactly once, with absence prerequisites before administration', () => {
    const plan = buildReplayPlan(migrations)
    const ordered = plan.map((entry) => entry.source)
    expect([...ordered].sort((a, b) => a.localeCompare(b))).toEqual(
      [...migrations].sort((a, b) => a.localeCompare(b)),
    )
    expect(ordered.indexOf(types)).toBeLessThan(ordered.indexOf(followup))
    expect(ordered.indexOf(followup)).toBeLessThan(ordered.indexOf(admin))
    expect(plan.map((entry) => entry.target.slice(0, 14))).toEqual(
      [...migrations].sort((a, b) => a.localeCompare(b)).map((file) => file.slice(0, 14)),
    )
  })

  it('rejects missing dependencies, malformed names and duplicate versions', () => {
    expect(() => buildReplayPlan(migrations.filter((file) => file !== followup))).toThrow('missing')
    expect(() => buildReplayPlan(migrations.filter((file) => file !== types))).toThrow('missing')
    expect(() => buildReplayPlan([...migrations, 'invalid.sql'])).toThrow('filename')
    expect(() => buildReplayPlan([...migrations, '20261110130000_duplicate.sql'])).toThrow(
      'Duplicate',
    )
  })

  it('refuses paths in the repository or relative paths', () => {
    expect(() => prepareReplay('.')).toThrow('absolute')
    expect(() => prepareReplay(fileURLToPath(new URL('..', import.meta.url)))).toThrow('outside')
  })
})
