import { describe, expect, it } from 'vitest'

import { can } from './permissions'

describe('vacation permissions', () => {
  it('lets technicians request their own vacation but not decide requests', () => {
    expect(can('technician', 'vacations:request')).toBe(true)
    expect(can('technician', 'vacations:manage')).toBe(false)
  })

  it('lets owners and admins manage requests, not editors or viewers', () => {
    expect(can('owner', 'vacations:manage')).toBe(true)
    expect(can('admin', 'vacations:manage')).toBe(true)
    expect(can('editor', 'vacations:manage')).toBe(false)
    expect(can('viewer', 'vacations:manage')).toBe(false)
  })
})
