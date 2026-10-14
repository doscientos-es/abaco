import { describe, expect, it, vi } from 'vitest'

import { Route } from '@/routes/ajustes'

vi.mock('@/features/auth', () => ({ requirePermission: () => () => undefined }))
vi.mock('@/features/settings', () => ({ SettingsPage: () => null }))

function validate(search: Record<string, unknown>) {
  const validator = Route.options.validateSearch
  if (typeof validator !== 'function') throw new Error('Missing settings search validator')
  return validator(search)
}

describe('settings route search', () => {
  it('supports direct links to the news tab', () => {
    expect(validate({ tab: 'novedades' })).toEqual({ tab: 'novedades' })
  })

  it('rejects unknown tabs', () => {
    expect(validate({ tab: 'unknown' })).toEqual({})
  })

  it('keeps the payment return focused on billing', () => {
    expect(validate({ pago: 'ok' })).toEqual({ tab: 'plan', pago: 'ok' })
    expect(validate({ tab: 'novedades', pago: 'ok' })).toEqual({ tab: 'novedades', pago: 'ok' })
  })
})
