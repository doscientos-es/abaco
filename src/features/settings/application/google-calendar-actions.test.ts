import { FunctionsHttpError } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  beginGoogleCalendarConnection,
  completeGoogleCalendarConnection,
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  GoogleCalendarAccessInactiveError,
  GoogleCalendarPermissionError,
  googleCalendarStatusQuery,
  queueGoogleCalendarSync,
  type GoogleCalendarStatus,
} from './google-calendar-actions'

const { invoke, rpc } = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }))

vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ functions: { invoke }, rpc }),
}))

describe('Google Calendar settings actions', () => {
  const state = 'a'.repeat(43)
  const memory = new Map<string, string>()
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  }

  beforeEach(() => {
    vi.resetAllMocks()
    memory.clear()
    vi.stubGlobal('sessionStorage', storage)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reads only a valid connection status payload', async () => {
    invoke.mockResolvedValue({
      data: {
        status: 'connected',
        lastSyncedAt: '2026-11-20T12:00:00.000Z',
        lastError: null,
        pendingJobs: 2,
        accessActive: true,
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

  it('refreshes while provisioning or syncing and stops when settled', () => {
    const client = new QueryClient()
    const options = googleCalendarStatusQuery('tenant-id')
    const query = client
      .getQueryCache()
      .build<GoogleCalendarStatus, Error, GoogleCalendarStatus, string[]>(client, options)
    const interval = options.refetchInterval
    if (typeof interval !== 'function') throw new Error('Expected dynamic refresh interval')
    const base = {
      lastSyncedAt: null,
      lastError: null,
      pendingJobs: 0,
      accessActive: true,
    } as const

    query.setData({ ...base, status: 'provisioning' })
    expect(interval(query)).toBe(5_000)
    query.setData({ ...base, status: 'connected', pendingJobs: 1 })
    expect(interval(query)).toBe(5_000)
    query.setData({ ...base, status: 'connected' })
    expect(interval(query)).toBe(false)
    query.setData({ ...base, status: 'provisioning', accessActive: false })
    expect(interval(query)).toBe(false)
    client.clear()
  })

  it('distinguishes an explicit permission denial from other service errors', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(Response.json({ error: 'not_allowed' }, { status: 403 })),
    })
    await expect(getGoogleCalendarStatus('tenant-id')).rejects.toBeInstanceOf(
      GoogleCalendarPermissionError,
    )

    invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(Response.json({ error: 'access_inactive' }, { status: 403 })),
    })
    await expect(beginGoogleCalendarConnection('tenant-id')).rejects.toBeInstanceOf(
      GoogleCalendarAccessInactiveError,
    )

    invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(
        Response.json({ error: 'origin_not_allowed' }, { status: 403 }),
      ),
    })
    await expect(getGoogleCalendarStatus('tenant-id')).rejects.toThrow(
      'Google Calendar no está disponible.',
    )
  })

  it('accepts only the Google OAuth origin before redirecting', async () => {
    invoke.mockResolvedValue({
      data: { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${state}` },
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

  it('completes only the authorization started in this tab and removes the code from the URL', async () => {
    invoke.mockResolvedValueOnce({
      data: { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${state}` },
      error: null,
    })
    await beginGoogleCalendarConnection('tenant-id')
    const replaceState = vi.fn()
    vi.stubGlobal('window', {
      location: {
        hash: `#calendar_state=${state}&calendar_code=test-code`,
        pathname: '/ajustes',
        search: '?tab=integraciones',
      },
      history: { state: null, replaceState },
    })
    invoke.mockResolvedValueOnce({ data: { connected: true }, error: null })
    await expect(completeGoogleCalendarConnection('tenant-id')).resolves.toBe(true)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/ajustes?tab=integraciones')
    expect(invoke).toHaveBeenLastCalledWith('google-calendar-oauth', {
      body: { action: 'complete', tenantId: 'tenant-id', state, code: 'test-code' },
    })
    await expect(completeGoogleCalendarConnection('tenant-id')).rejects.toThrow('sesión')
  })

  it('rejects a callback started in a different browser before calling the server', async () => {
    vi.stubGlobal('window', {
      location: {
        hash: `#calendar_state=${state}&calendar_code=test-code`,
        pathname: '/ajustes',
        search: '',
      },
      history: { state: null, replaceState: vi.fn() },
    })
    await expect(completeGoogleCalendarConnection('tenant-id')).rejects.toThrow('sesión')
    expect(invoke).not.toHaveBeenCalled()
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
