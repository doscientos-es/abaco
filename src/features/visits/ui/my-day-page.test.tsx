import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  start: undefined as (() => void) | undefined,
  transition: vi.fn(),
  error: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock('@doscientos/ui', () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => {
    if (children === 'Iniciar visita') mocks.start = onPress
    return <button>{children}</button>
  },
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  toast: { success: vi.fn(), error: mocks.error },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    isSuccess: true,
    data: queryKey[0] === 'my-visits' ? [visit] : [],
  }),
}))
vi.mock('@/features/auth', () => ({
  useSession: () => ({
    tenantId: 'tenant',
    userId: 'worker',
    role: 'user',
    companies: [{ id: 'tenant', collectVisitStartLocation: false }],
  }),
}))
vi.mock('../application/visit-actions', () => ({
  listMyVisits: vi.fn(),
  transitionServiceVisit: mocks.transition,
}))
vi.mock('./visit-report-editor', () => ({ VisitReportEditor: () => null }))

import { MyDayPage } from './my-day-page'

const visit = {
  id: 'visit',
  title: 'Limpieza',
  client_name: 'Cliente',
  status: 'scheduled',
  scheduled_start_at: '2026-11-12T08:00:00Z',
  scheduled_end_at: '2026-11-12T09:00:00Z',
  timezone: 'Europe/Madrid',
  updated_at: '2026-11-12T07:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.start = undefined
  mocks.transition.mockResolvedValue(undefined)
  mocks.invalidate.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

describe('starting an assigned visit', () => {
  it('requests and sends the location even when the old company setting was disabled', async () => {
    const getCurrentPosition = vi.fn((resolve: PositionCallback) =>
      resolve({ coords: { latitude: 41.3, longitude: 2.1 } } as GeolocationPosition),
    )
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    const html = renderToStaticMarkup(<MyDayPage />)

    expect(html).toContain('se guarda la hora y una ubicación puntual')
    mocks.start?.()
    await vi.waitFor(() => expect(mocks.transition).toHaveBeenCalledOnce())
    expect(getCurrentPosition).toHaveBeenCalledOnce()
    expect(mocks.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        nextStatus: 'in_progress',
        startLocation: { latitude: 41.3, longitude: 2.1 },
      }),
    )
  })

  it('does not start the visit when location permission is denied', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_: PositionCallback, reject: PositionErrorCallback) =>
          reject({} as GeolocationPositionError),
      },
    })
    renderToStaticMarkup(<MyDayPage />)

    mocks.start?.()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(mocks.transition).not.toHaveBeenCalled()
  })
})
