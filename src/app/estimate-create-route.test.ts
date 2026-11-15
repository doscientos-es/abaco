import { describe, expect, it, vi } from 'vitest'

import { Route } from '@/routes/presupuestos.nuevo'

vi.mock('@/features/auth', () => ({ requirePermission: () => () => undefined }))
vi.mock('@/features/estimates/ui/estimate-create-page', () => ({ EstimateCreatePage: () => null }))

describe('estimate creation route', () => {
  it('preserves the chosen format and defaults invalid values to sections', () => {
    const validate = Route.options.validateSearch
    if (typeof validate !== 'function') throw new Error('Missing search validator')
    expect(validate({ clientId: 'client', title: 'Oferta', format: 'table' })).toEqual({
      clientId: 'client',
      title: 'Oferta',
      format: 'table',
    })
    expect(validate({ format: 'sections' }).format).toBe('sections')
    expect(validate({ format: 'invalid' }).format).toBe('sections')
    expect(validate({}).format).toBe('sections')
  })
})
