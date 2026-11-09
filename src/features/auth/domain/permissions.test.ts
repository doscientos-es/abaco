import { describe, expect, it } from 'vitest'

import { assignableRoles, can } from './permissions'

describe('role permissions', () => {
  it('lets users request their own vacation but not decide requests', () => {
    expect(can('user', 'vacations:request')).toBe(true)
    expect(can('user', 'vacations:manage')).toBe(false)
    expect(can('user', 'visits:assigned')).toBe(true)
    expect(can('user', 'work:read')).toBe(false)
  })

  it('lets admins manage requests and hand out only admin/user roles', () => {
    expect(can('admin', 'vacations:manage')).toBe(true)
    expect(can('admin', 'work:read')).toBe(true)
    expect(assignableRoles('admin')).toEqual(['admin', 'user'])
    expect(assignableRoles('user')).toEqual([])
  })
})
