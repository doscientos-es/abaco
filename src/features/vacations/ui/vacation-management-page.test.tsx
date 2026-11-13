import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VacationManagementPage } from './vacation-management-page'

const mocks = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
  filterNeedsInfo: false,
  stateIndex: 0,
  tab: 'pending' as 'calendar' | 'pending',
  setTab: vi.fn(),
  setFilter: vi.fn(),
  setType: vi.fn(),
  setSearch: vi.fn(),
  buttons: new Map<string, () => void>(),
  overview: null as null | {
    requests: Array<Record<string, unknown>>
    onRange: (from: string, through: string) => void
  },
  selectTab: null as null | ((key: string) => void),
  from: '',
  to: '',
  setFrom: vi.fn(),
  setTo: vi.fn(),
  picker: null as null | {
    start: string
    end: string
    mode: string
    onChange: (start: string, end: string) => void
  },
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const [value, setValue] = actual.useState(initial)
      const index = mocks.stateIndex++
      if (index === 0) return [mocks.filterNeedsInfo ? 'needs_info' : value, mocks.setFilter]
      if (index === 1) return [value, mocks.setType]
      if (index === 2) return [value, mocks.setSearch]
      if (index === 3) return [mocks.from, mocks.setFrom]
      if (index === 4) return [mocks.to, mocks.setTo]
      if (index === 8) return [mocks.tab, mocks.setTab]
      return [value, setValue]
    },
  }
})

vi.mock('@doscientos/ui', () => ({
  Button: ({
    children,
    onPress,
    ...props
  }: {
    children: ReactNode
    onPress?: () => void
    'aria-label'?: string
  }) => {
    if (typeof children === 'string' && onPress) mocks.buttons.set(children, onPress)
    return <button aria-label={props['aria-label']}>{children}</button>
  },
  Tabs: ({
    children,
    onSelectionChange,
  }: {
    children: ReactNode
    onSelectionChange: (key: string) => void
  }) => {
    mocks.selectTab = onSelectionChange
    return <div>{children}</div>
  },
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  TabsContent: ({
    children,
    id,
    shouldForceMount,
  }: {
    children: ReactNode
    id: string
    shouldForceMount?: boolean
  }) =>
    id === mocks.tab ? (
      <div>{children}</div>
    ) : shouldForceMount ? (
      <div hidden>{children}</div>
    ) : null,
  Popover: ({ trigger, children }: { trigger: ReactNode; children: ReactNode }) => (
    <>
      {trigger}
      {children}
    </>
  ),
  Textarea: () => <textarea />,
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: mocks.data, isSuccess: true }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
}))
vi.mock('@/features/auth', () => ({ useSession: () => ({ tenantId: 'tenant-1' }) }))
vi.mock('../application/vacation-actions', () => ({
  decideVacationRequest: vi.fn(),
  listVacationRequests: vi.fn(),
  requestAbsenceInformation: vi.fn(),
}))
vi.mock('./vacation-coverage', () => ({ VacationCoverage: () => null }))
vi.mock('./absence-overview', () => ({
  AbsenceOverview: (props: NonNullable<typeof mocks.overview>) => {
    mocks.overview = props
    return <div>Vista del calendario</div>
  },
}))
vi.mock('./absence-date-range-picker', () => ({
  AbsenceDateRangePicker: (props: NonNullable<typeof mocks.picker>) => {
    mocks.picker = props
    return <div>Calendario de filtro</div>
  },
}))
vi.mock('./vacation-request-card', () => ({
  VacationRequestCard: ({
    children,
    request,
  }: {
    children?: ReactNode
    request: { requesterName: string }
  }) => (
    <div>
      {request.requesterName}
      {children}
    </div>
  ),
}))

describe('VacationManagementPage', () => {
  beforeEach(() => {
    mocks.data = []
    mocks.filterNeedsInfo = false
    mocks.stateIndex = 0
    mocks.tab = 'pending'
    mocks.overview = null
    mocks.selectTab = null
    mocks.from = ''
    mocks.to = ''
    mocks.picker = null
    mocks.buttons.clear()
    vi.clearAllMocks()
  })

  it('provides status, worker, type and date filters for the absence inbox', () => {
    const html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html).toContain('Necesita información')
    expect(html).toContain('Buscar trabajador')
    expect(html).toContain('Todos los tipos')
    expect(html).toContain('Fechas')
    expect(html).toContain('Cualquier fecha')
    expect(html).toContain('Filtrar por fechas. Desde sin límite hasta sin límite')
    expect(html).not.toContain('max-w-4xl')
    expect(html).not.toContain('Revisa cada solicitud')
    expect(html).not.toContain('type="date"')
    expect(mocks.picker?.mode).toBe('filter')
    mocks.picker?.onChange('2026-11-10', '2026-11-12')
    expect(mocks.setFrom).toHaveBeenCalledWith('2026-11-10')
    expect(mocks.setTo).toHaveBeenCalledWith('2026-11-12')
  })

  it('scopes both the calendar and absence inbox to the selected people', () => {
    mocks.data = ['ana', 'bea'].map((id) => ({
      id,
      requesterId: id,
      requesterName: id === 'ana' ? 'Ana' : 'Bea',
      status: 'pending',
      absenceType: 'other',
      startDate: '2026-11-10',
      endDate: null,
    }))
    const html = renderToStaticMarkup(<VacationManagementPage memberIds={['ana']} embedded />)
    expect(mocks.overview?.requests.map((request) => request.requesterId)).toEqual(['ana'])
    expect(html).toContain('Ana')
    expect(html).not.toContain('Bea')
    expect(html).not.toContain('<h1')
  })

  it('summarizes a complete or open-ended date filter in one accessible control', () => {
    mocks.from = '2026-11-10'
    mocks.to = '2026-11-12'
    let html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html).toContain('10 nov 2026 – 12 nov 2026')
    expect(html).toContain('Filtrar por fechas. Desde 10 nov 2026 hasta 12 nov 2026')

    mocks.stateIndex = 0
    mocks.from = ''
    html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html).toContain('Hasta 12 nov 2026')
    expect(html).toContain('Filtrar por fechas. Desde sin límite hasta 12 nov 2026')

    mocks.stateIndex = 0
    mocks.from = '2026-11-10'
    mocks.to = ''
    html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html).toContain('Desde 10 nov 2026')
    expect(html).toContain('Filtrar por fechas. Desde 10 nov 2026 hasta sin límite')
  })

  it('keeps the worker search visible and can clear secondary filters without resetting status', () => {
    mocks.from = '2026-11-10'
    mocks.to = '2026-11-12'
    const html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html.indexOf('Buscar trabajador')).toBeLessThan(html.indexOf('Filtros adicionales'))
    expect(html).toContain('Filtros adicionales, 1 activo')
    mocks.buttons.get('Limpiar filtros adicionales')?.()
    expect(mocks.setType).toHaveBeenCalledWith('all')
    expect(mocks.setFrom).toHaveBeenCalledWith('')
    expect(mocks.setTo).toHaveBeenCalledWith('')
    expect(mocks.setFilter).not.toHaveBeenCalled()
    expect(mocks.setSearch).not.toHaveBeenCalled()
  })

  it('separates the calendar and inbox and transfers a selected period to the inbox', () => {
    mocks.tab = 'calendar'
    mocks.data = [
      {
        id: '1',
        requesterName: 'Ana',
        status: 'pending',
        absenceType: 'other',
        startDate: '2026-11-10',
        endDate: null,
      },
    ]
    const html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html).toContain('Calendario')
    expect(html).toContain('Pendientes')
    expect(html).toContain('Vista del calendario')
    expect(html).not.toContain('Buscar trabajador')
    expect(mocks.overview?.requests).toEqual(mocks.data)
    mocks.selectTab?.('pending')
    expect(mocks.setTab).toHaveBeenCalledWith('pending')
    mocks.overview?.onRange('2026-11-10', '2026-11-10')
    expect(mocks.setFrom).toHaveBeenCalledWith('2026-11-10')
    expect(mocks.setTo).toHaveBeenCalledWith('2026-11-10')
    expect(mocks.setFilter).toHaveBeenCalledWith('all')
    expect(mocks.setType).toHaveBeenCalledWith('all')
    expect(mocks.setSearch).toHaveBeenCalledWith('')
    expect(mocks.setTab).toHaveBeenCalledWith('pending')
  })

  it('filtra solapamientos inclusivos y ausencias sin fecha final', () => {
    mocks.data = [
      {
        id: '1',
        requesterName: 'Ana',
        status: 'pending',
        absenceType: 'other',
        startDate: '2026-11-01',
        endDate: '2026-11-10',
      },
      {
        id: '2',
        requesterName: 'Bea',
        status: 'pending',
        absenceType: 'other',
        startDate: '2026-11-12',
        endDate: null,
      },
      {
        id: '3',
        requesterName: 'Celia',
        status: 'pending',
        absenceType: 'other',
        startDate: '2026-11-13',
        endDate: null,
      },
      {
        id: '4',
        requesterName: 'Dani',
        status: 'pending',
        absenceType: 'other',
        startDate: '2026-11-01',
        endDate: '2026-11-09',
      },
    ]
    mocks.from = '2026-11-10'
    mocks.to = '2026-11-12'
    let html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html).toContain('Ana')
    expect(html).toContain('Bea')
    expect(html).not.toContain('Celia')
    expect(html).not.toContain('Dani')

    mocks.stateIndex = 0
    mocks.from = ''
    html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html).toContain('Dani')
    expect(html).not.toContain('Celia')

    mocks.stateIndex = 0
    mocks.from = '2026-11-10'
    mocks.to = ''
    html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html).toContain('Celia')
    expect(html).not.toContain('Dani')
  })

  it('does not offer a final decision while an absence is waiting for the worker', () => {
    mocks.data = [
      {
        id: 'request-info',
        requesterId: 'worker-1',
        requesterName: 'Ana',
        absenceType: 'sick_leave',
        startDate: '2026-11-10',
        endDate: null,
        comment: '',
        status: 'needs_info',
        submittedAt: '2026-11-09T10:00:00Z',
        decisionComment: '',
        decidedAt: null,
        decidedByName: '',
        informationRequestComment: 'Confirma las fechas.',
        requesterResponseComment: '',
      },
    ]
    mocks.filterNeedsInfo = true
    const html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html).toContain('La solicitud está esperando respuesta del trabajador')
    expect(html).toContain('Solicitar información')
    expect(html).not.toContain('>Aprobar<')
    expect(html).not.toContain('>Rechazar<')
  })
})
