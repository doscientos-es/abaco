import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadWorkerAvatar, saveWorkerAvatar } from './worker-avatar-storage'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  signed: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    storage: {
      from: () => ({ upload: mocks.upload, remove: mocks.remove, createSignedUrl: mocks.signed }),
    },
  }),
}))

describe('worker avatar storage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle }
    mocks.from.mockReturnValue(query)
    mocks.select.mockReturnValue(query)
    mocks.eq.mockReturnValue(query)
    mocks.remove.mockResolvedValue({ error: null })
    mocks.upload.mockResolvedValue({ error: null })
  })

  it('loads a short-lived signed URL only when a photo exists', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect(await loadWorkerAvatar('company', 'worker')).toBeNull()
    expect(mocks.signed).not.toHaveBeenCalled()
    mocks.maybeSingle.mockResolvedValueOnce({ data: { object_path: 'private-path' }, error: null })
    mocks.signed.mockResolvedValueOnce({ data: { signedUrl: 'signed-url' }, error: null })
    expect(await loadWorkerAvatar('company', 'worker')).toBe('signed-url')
    expect(mocks.signed).toHaveBeenCalledWith('private-path', 1800)
  })

  it('replaces the reference before cleaning up the old file', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'old-path', error: null })
    const file = new File(['image'], 'photo.png', { type: 'image/png' })
    await saveWorkerAvatar('company', 'worker', file)
    const path = mocks.upload.mock.calls[0]?.[0] as string
    expect(path).toMatch(/^company\/worker\/.+\.png$/)
    expect(mocks.rpc).toHaveBeenCalledWith('set_worker_avatar', {
      p_tenant: 'company',
      p_user: 'worker',
      p_path: path,
    })
    expect(mocks.remove).toHaveBeenCalledWith(['old-path'])
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.remove.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('rejects unsupported files and cleans up an upload if saving fails', async () => {
    await expect(
      saveWorkerAvatar('company', 'worker', new File(['x'], 'x.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow()
    expect(mocks.upload).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValueOnce({ error: { message: 'denied' } })
    await expect(
      saveWorkerAvatar('company', 'worker', new File(['x'], 'x.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow()
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0]?.[0]])
  })
})
