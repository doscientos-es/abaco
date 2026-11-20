import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  beginGoogleCalendarConnection,
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  queueGoogleCalendarSync,
} from './google-calendar-actions'

const { invoke, rpc } = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }))

vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ functions: { invoke }, rpc }),
}))

describe('Google Calendar settings actions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('reads only a valid connection status payload', async () => {
    invoke.mockResolvedValue({
      data: {
        status: 'connected',
        lastSyncedAt: '2026-11-20T12:00:00.000Z',
        lastError: null,
        pendingJobs: 2,
      },
      error: null,
    })
    await expect(getGoogleCalendarStatus('tenant-id')).resolves.toMatchObject({
      status: 'connected',
      pendingJobs: 2,
    })
    expect(invoke).toHaveBeenCalledWith('google-calendar-oauth', {
      body: { action: 'status', tenantId: 'tenant-id' },
    })
  })

  it('accepts only the Google OAuth origin before redirecting', async () => {
    invoke.mockResolvedValue({
      data: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=x' },
      error: null,
    })
    await expect(beginGoogleCalendarConnection('tenant-id')).resolves.toContain(
      'https://accounts.google.com/',
    )
    invoke.mockResolvedValue({
      data: { authorizationUrl: 'https://attacker.example/' },
      error: null,
    })
    await expect(beginGoogleCalendarConnection('tenant-id')).rejects.toThrow('dirección')
  })

  it('reports disconnect and queues a manual synchronization through authenticated RPCs', async () => {
    invoke.mockResolvedValue({ data: { disconnected: true }, error: null })
    await expect(disconnectGoogleCalendar('tenant-id')).resolves.toBeUndefined()
    rpc.mockResolvedValue({ data: 3, error: null })
    await expect(queueGoogleCalendarSync('tenant-id')).resolves.toBe(3)
    expect(rpc).toHaveBeenCalledWith('queue_my_google_calendar_sync', {
      p_tenant_id: 'tenant-id',
    })
  })
})
