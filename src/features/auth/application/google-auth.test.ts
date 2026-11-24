import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { finishGoogleAuth, safeAuthRedirect, startGoogleAuth } from './google-auth'

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  updateUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  updateProfile: vi.fn(),
  profileId: vi.fn(),
  profileName: vi.fn(),
  clearReferral: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ auth: mocks, rpc: mocks.rpc, from: mocks.from }),
}))
vi.mock('./referral-actions', () => ({ clearReferral: mocks.clearReferral }))

describe('Google authentication', () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => {
    vi.resetAllMocks()
    const values = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } })
    mocks.signInWithOAuth.mockResolvedValue({ error: null })
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { user_metadata: { full_name: 'Nombre Google' } } } },
      error: null,
    })
    mocks.updateUser.mockResolvedValue({ error: null })
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    mocks.from.mockReturnValue({ update: mocks.updateProfile })
    mocks.updateProfile.mockReturnValue({ eq: mocks.profileId })
    mocks.profileId.mockReturnValue({ eq: mocks.profileName })
    mocks.profileName.mockResolvedValue({ error: null })
  })

  it('starts Supabase PKCE login without requesting Calendar access', async () => {
    await startGoogleAuth('/trabajos')
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://app.example.test/acceso-google' },
    })
    await expect(finishGoogleAuth('code')).resolves.toBe('/trabajos')
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('code')
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('records the signup company and referral only after Google authentication', async () => {
    await startGoogleAuth('/', {
      fullName: 'Ana López',
      companyName: 'Empresa',
      referralCode: 'AB12CD34EF56AB78',
    })
    await finishGoogleAuth('code')
    expect(mocks.rpc).toHaveBeenCalledWith('my_company_memberships')
    expect(mocks.updateUser).toHaveBeenCalledWith({
      data: {
        company_name: 'Empresa',
        welcome_pending: true,
        abaco_referral_code: 'AB12CD34EF56AB78',
      },
    })
    expect(mocks.clearReferral).toHaveBeenCalledOnce()
  })

  it('does not overwrite an existing member or create a second company', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ tenant_id: 'existing' }], error: null })
    await startGoogleAuth('/', { fullName: 'Ana López', companyName: 'Empresa' })
    await finishGoogleAuth('code')
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('fills only an empty profile name when Google does not supply one', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1', user_metadata: {} } } },
      error: null,
    })
    await startGoogleAuth('/', { fullName: 'Ana López', companyName: 'Empresa' })
    await finishGoogleAuth('code')
    expect(mocks.from).toHaveBeenCalledWith('profiles')
    expect(mocks.updateProfile).toHaveBeenCalledWith({ full_name: 'Ana López' })
    expect(mocks.profileId).toHaveBeenCalledWith('id', 'user-1')
    expect(mocks.profileName).toHaveBeenCalledWith('full_name', '')
    expect(mocks.updateUser).toHaveBeenCalledWith({
      data: {
        full_name: 'Ana López',
        company_name: 'Empresa',
        welcome_pending: true,
      },
    })
  })

  it('never completes a return without browser state or after a failed membership check', async () => {
    await expect(finishGoogleAuth('code')).rejects.toThrow()
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled()
    await startGoogleAuth('/', { fullName: 'Ana López', companyName: 'Empresa' })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
    await expect(finishGoogleAuth('code')).rejects.toThrow()
    expect(mocks.updateUser).not.toHaveBeenCalled()
    await expect(finishGoogleAuth('code')).rejects.toThrow()
  })

  it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/\n/evil.test'])(
    'rejects external redirects: %s',
    (path) => {
      expect(safeAuthRedirect(path)).toBe('/')
    },
  )
})
