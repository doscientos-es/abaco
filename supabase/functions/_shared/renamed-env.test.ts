import { afterEach, describe, expect, it, vi } from 'vitest'

import { renamedEnv } from './renamed-env'

describe('renamed environment variables', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('prefers the new name and falls back when it is absent or empty', () => {
    const values: Record<string, string> = { ABACO_CAL_EVENT_TYPE_ID: 'legacy' }
    vi.stubGlobal('Deno', { env: { get: (name: string) => values[name] } })
    expect(renamedEnv('CAL_EVENT_TYPE_ID')).toBe('legacy')
    values.MENOSLIOS_CAL_EVENT_TYPE_ID = 'new'
    expect(renamedEnv('CAL_EVENT_TYPE_ID')).toBe('new')
    values.MENOSLIOS_CAL_EVENT_TYPE_ID = ''
    expect(renamedEnv('CAL_EVENT_TYPE_ID')).toBe('legacy')
    delete values.ABACO_CAL_EVENT_TYPE_ID
    expect(renamedEnv('CAL_EVENT_TYPE_ID')).toBeUndefined()
  })
})
