import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  start: undefined as (() => void) | undefined,
  transition: vi.fn(),
  error: vi.fn(),
  invalidate: vi.fn(),
  date: null as string | null,
  actions: new Map<string, () => void>(),
  visitsQuery: null as null | { queryKey: string[]; queryFn: () => unknown },
  listVisits: vi.fn(),
  visits: [] as Array<Record<string, unknown>>,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (typeof initial === 'function' && mocks.date !== null) {
        return [
          mocks.date,
          (update: string | ((current: string) => string)) => {
            if (mocks.date !== null) {
              mocks.date = typeof update === 'function' ? update(mocks.date) : update
            }
          },
        ]
      }
      return actual.useState(initial)
    },
  }
})
vi.mock('@doscientos/ui', () => ({
  Button: ({
    children,
    onPress,
    'aria-label': label,
  }: {
    children: ReactNode
    onPress?: () => void
    'aria-label'?: string
  }) => {
    if (children === 'Iniciar visita') mocks.start = onPress
    if (label && onPress) mocks.actions.set(label, onPress)
    return <button aria-label={label}>{children}</button>
  },
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  toast: { success: vi.fn(), error: mocks.error },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: (options: { queryKey: string[]; queryFn: () => unknown }) => {
    if (options.queryKey[0] === 'my-visits') mocks.visitsQuery = options
    return {
      isSuccess: true,
      data: options.queryKey[0] === 'my-visits' ? mocks.visits : [],
    }
  },
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
  listMyVisits: mocks.listVisits,
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
  mocks.date = null
  mocks.actions.clear()
  mocks.visitsQuery = null
  mocks.visits = [visit]
  mocks.transition.mockResolvedValue(undefined)
  mocks.invalidate.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

describe('navegación por días', () => {
  it('avanza y retrocede entre meses y años, consultando el día seleccionado', () => {
    mocks.date = '2026-12-31'
    const html = renderToStaticMarkup(<MyDayPage />)

    expect(html).toContain('aria-label="Día anterior"')
    expect(html).toContain('aria-label="Día siguiente"')
    expect(html).toContain('type="date"')
    expect(mocks.actions.has('Día siguiente')).toBe(true)
    mocks.actions.get('Día siguiente')?.()
    mocks.actions.get('Día siguiente')?.()
    expect(mocks.date).toBe('2027-01-02')

    renderToStaticMarkup(<MyDayPage />)
    expect(mocks.visitsQuery?.queryKey).toEqual(['my-visits', 'tenant', '2027-01-02'])
    mocks.visitsQuery?.queryFn()
    expect(mocks.listVisits).toHaveBeenCalledWith('tenant', '2027-01-02', '2027-01-02')

    expect(mocks.actions.has('Día anterior')).toBe(true)
    mocks.actions.get('Día anterior')?.()
    mocks.actions.get('Día anterior')?.()
    expect(mocks.date).toBe('2026-12-31')
  })

  it('groups assigned work under the contract and keeps individual actions available', () => {
    mocks.visits = [
      { ...visit, contract_id: 'contract', contract_title: 'Oficina', title: 'Fregar' },
      {
        ...visit,
        id: 'other',
        contract_id: 'contract',
        contract_title: 'Oficina',
        title: 'Cristales',
      },
    ]
    const html = renderToStaticMarkup(<MyDayPage />)
    expect(html).toContain('Calendario')
    expect(html).toContain('Oficina')
    expect(html).toContain('2 trabajos')
    expect(html).toContain('Fregar')
    expect(html).toContain('Cristales')
    expect(html.match(/Iniciar visita/g)).toHaveLength(2)
  })
})

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
