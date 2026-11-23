import { describe, expect, it, vi } from 'vitest'

import { signUp } from './auth-actions'

const { createAccount } = vi.hoisted(() => ({ createAccount: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ auth: { signUp: createAccount } }),
}))

describe('signup referral', () => {
  it('sends the remembered code in account metadata for company creation after email confirmation', async () => {
    createAccount.mockResolvedValue({ data: { session: null }, error: null })
    await expect(
      signUp({
        fullName: 'Ana López',
        companyName: 'Empresa',
        email: 'ana@example.test',
        password: 'Password123!',
        referralCode: 'AB12CD34EF56AB78',
      }),
    ).resolves.toEqual({ ok: true, needsConfirmation: true })
    expect(createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          data: expect.objectContaining({
            company_name: 'Empresa',
            abaco_referral_code: 'AB12CD34EF56AB78',
          }),
        },
      }),
    )
  })
})
