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
  arrivals: [] as Array<Record<string, unknown>>,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (typeof initial === 'function' && initial !== Date.now && mocks.date !== null) {
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
  queryOptions: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: (options: { queryKey: string[]; queryFn: () => unknown }) => {
    if (
      options.queryKey[0] === 'my-visits' &&
      options.queryKey[2] !== 'next' &&
      options.queryKey[2] !== 'drafts'
    )
      mocks.visitsQuery = options
    return {
      isSuccess: true,
      isFetchedAfterMount: true,
      data:
        options.queryKey[0] === 'my-visits' &&
        options.queryKey[2] !== 'next' &&
        options.queryKey[2] !== 'drafts'
          ? mocks.visits
          : options.queryKey[0] === 'assigned-visit-arrivals'
            ? mocks.arrivals
            : [],
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
vi.mock('./worker-visit-delay-notice', () => ({
  WorkerVisitDelayNotice: ({
    hasSharedContact,
    visit,
  }: {
    hasSharedContact: boolean
    visit: Record<string, unknown>
  }) => (
    <button data-contact={hasSharedContact} data-visit-fields={Object.keys(visit).sort().join(',')}>
      Preparar aviso de retraso
    </button>
  ),
}))
vi.mock('./visit-report-editor', () => ({ VisitReportEditor: () => null }))
vi.mock('./worker-agenda-change-notices', () => ({ WorkerAgendaChangeNotices: () => null }))

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
  mocks.arrivals = []
  mocks.transition.mockResolvedValue(undefined)
  mocks.invalidate.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('navegación por días', () => {
  it('opens the linked assigned visit on its day, including a collapsed contract group', () => {
    mocks.visits = [{ ...visit, contract_id: 'contract', contract_title: 'Oficina' }]
    const html = renderToStaticMarkup(
      <MyDayPage calendarVisit={{ empresa: 'tenant', visita: visit.id, fecha: '2026-11-12' }} />,
    )
    expect(mocks.visitsQuery?.queryKey).toEqual(['my-visits', 'tenant', '2026-11-12', 'worker'])
    expect(html).toContain('Visita abierta desde tu calendario')
    expect(html).toMatch(/<details[^>]*open/)
  })

  it('does not identify a visit when the calendar link belongs to another company', () => {
    const html = renderToStaticMarkup(
      <MyDayPage calendarVisit={{ empresa: 'other', visita: visit.id, fecha: '2026-11-12' }} />,
    )
    expect(html).toContain('Esta visita pertenece a otra empresa')
    expect(html).not.toContain('Visita abierta desde tu calendario')
  })

  it('explains when the linked visit is no longer assigned on that day', () => {
    mocks.visits = []
    const html = renderToStaticMarkup(
      <MyDayPage calendarVisit={{ empresa: 'tenant', visita: visit.id, fecha: '2026-11-12' }} />,
    )
    expect(html).toContain('No se encuentra esta visita en tu jornada')
  })

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
    expect(mocks.visitsQuery?.queryKey).toEqual(['my-visits', 'tenant', '2027-01-02', 'worker'])
    mocks.visitsQuery?.queryFn()
    expect(mocks.listVisits).toHaveBeenCalledWith('tenant', '2027-01-02', '2027-01-02')

    expect(mocks.actions.has('Día anterior')).toBe(true)
    mocks.actions.get('Día anterior')?.()
    mocks.actions.get('Día anterior')?.()
    expect(mocks.date).toBe('2026-12-31')
  })

  it('prioritizes ongoing work and renders a separate empty-day action', () => {
    mocks.visits = [
      { ...visit, status: 'in_progress' },
      { ...visit, id: 'done', status: 'completed' },
    ]
    const html = renderToStaticMarkup(<MyDayPage />)
    expect(html).toContain('Ir a la visita en curso')
    expect(html).toContain('Resumen de la jornada')
    expect(html).toContain('id="worker-visit-visit"')
    expect(html).toContain('Ver parte')
    mocks.visits = []
    const empty = renderToStaticMarkup(<MyDayPage />)
    expect(empty).toContain('Tu agenda está despejada')
    expect(empty).toContain('Ver calendario')
  })

  it('links only the authorized visit address to Maps and handles missing addresses', () => {
    mocks.visits = [
      { ...visit, address: 'C/ Peñón 4 & Norte', notes: 'Información privada 612345678' },
      { ...visit, id: 'other', title: 'Otra', address: '  ' },
    ]
    const html = renderToStaticMarkup(<MyDayPage />)
    expect(html).toContain('destination=C%2F+Pe%C3%B1%C3%B3n+4+%26+Norte')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('Sin dirección de visita.')
    expect(html.match(/La dirección puede estar incompleta/g)).toHaveLength(1)
    expect(html).toContain('Comprueba la localidad y el destino en Google Maps.')
    expect(html).not.toContain('wa.me')
    expect(html).not.toMatch(/href="[^"]*Informaci%C3%B3n/)
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

  it('locks a double tap before the geolocation prompt and refreshes all visit views', async () => {
    const pending: { resolve?: PositionCallback } = {}
    const getCurrentPosition = vi.fn((resolve: PositionCallback) => {
      pending.resolve = resolve
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    renderToStaticMarkup(<MyDayPage />)

    mocks.start?.()
    mocks.start?.()
    expect(getCurrentPosition).toHaveBeenCalledOnce()
    pending.resolve?.({ coords: { latitude: 41.3, longitude: 2.1 } } as GeolocationPosition)
    await vi.waitFor(() => expect(mocks.transition).toHaveBeenCalledOnce())
    await vi.waitFor(() =>
      expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['my-visits', 'tenant'] }),
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

describe('aviso de retraso desde mi jornada', () => {
  it('ofrece el borrador solo en visitas asignadas de hoy sin iniciar', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T07:00:00Z'))
    mocks.visits = [
      visit,
      { ...visit, id: 'closed', status: 'completed' },
      { ...visit, id: 'active', status: 'in_progress' },
      { ...visit, id: 'tomorrow', scheduled_start_at: '2026-11-13T08:00:00Z' },
    ]
    const html = renderToStaticMarkup(<MyDayPage />)
    expect(html.match(/Preparar aviso de retraso/g)).toHaveLength(1)
    expect(html).toContain('data-visit-fields="scheduled_start_at,status,timezone"')
    expect(html).toContain('data-contact="false"')
  })

  it('solo indica contacto si la misma visita lo ha recibido en la ficha de llegada', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T07:00:00Z'))
    mocks.arrivals = [{ visit_id: 'otra-visita', contact_phone: '+34612345678' }]
    expect(renderToStaticMarkup(<MyDayPage />)).toContain('data-contact="false"')
    mocks.arrivals = [{ visit_id: visit.id, contact_phone: '+34612345678' }]
    expect(renderToStaticMarkup(<MyDayPage />)).toContain('data-contact="true"')
  })
})
