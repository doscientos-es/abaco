import { beforeEach, describe, expect, it, vi } from 'vitest'

import { saveBillingProfile } from './subscription-billing-profile'

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }))

vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ from: () => ({ upsert }) }),
}))

describe('saving subscription billing details', () => {
  beforeEach(() => upsert.mockReset().mockResolvedValue({ error: null }))

  it('trims text and normalizes the tax ID before saving', async () => {
    const form = new FormData()
    form.set('legal_name', '  Empresa de prueba  ')
    form.set('tax_id', '  b12345678 ')

    await saveBillingProfile('tenant-test', form)

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-test',
        legal_name: 'Empresa de prueba',
        tax_id: 'B12345678',
      }),
      { onConflict: 'tenant_id' },
    )
  })

  it('rejects a file in a text field before making a request', async () => {
    const form = new FormData()
    form.set('legal_name', new Blob(['text']), 'test.txt')

    await expect(saveBillingProfile('tenant-test', form)).rejects.toThrow(
      'No se guardaron los datos fiscales',
    )
    expect(upsert).not.toHaveBeenCalled()
  })
})
