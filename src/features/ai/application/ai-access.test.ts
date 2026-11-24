import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => options }))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ rpc: mocks.rpc }),
}))

import { useAiCredits } from './ai-access'

describe('AI credits query', () => {
  beforeEach(() => mocks.rpc.mockReset())

  it('queries the current user’s credits scoped to the company', async () => {
    const balance = { monthly_limit: 500, monthly_used: 42, extra_remaining: 3 }
    mocks.rpc.mockResolvedValue({ data: balance, error: null })
    const options = useAiCredits('tenant-a', 'user-a') as unknown as {
      queryKey: unknown[]
      enabled: boolean
      queryFn: () => Promise<unknown>
    }
    expect(options.queryKey).toEqual(['ai-credits', 'tenant-a', 'user-a'])
    expect(options.enabled).toBe(true)
    await expect(options.queryFn()).resolves.toEqual(balance)
    expect(mocks.rpc).toHaveBeenCalledWith('ai_my_credits', { p_tenant: 'tenant-a' })
  })

  it('does not enable the query without an identity and rejects malformed balances', async () => {
    const options = useAiCredits('tenant-a', undefined) as unknown as {
      enabled: boolean
      queryFn: () => Promise<unknown>
    }
    expect(options.enabled).toBe(false)
    mocks.rpc.mockResolvedValue({ data: { monthly_limit: -1 }, error: null })
    await expect(options.queryFn()).rejects.toThrow()
  })
})
