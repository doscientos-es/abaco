import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VacationManagementPage } from './vacation-management-page'

const mocks = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
  filterNeedsInfo: false,
  stateIndex: 0,
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
      if (index === 3) return [mocks.from, mocks.setFrom]
      if (index === 4) return [mocks.to, mocks.setTo]
      return mocks.filterNeedsInfo && initial === 'pending'
        ? ['needs_info', setValue]
        : [value, setValue]
    },
  }
})

vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
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
  useQuery: () => ({ data: mocks.data }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
}))
vi.mock('@/features/auth', () => ({ useSession: () => ({ tenantId: 'tenant-1' }) }))
vi.mock('../application/vacation-actions', () => ({
  decideVacationRequest: vi.fn(),
  listVacationRequests: vi.fn(),
  requestAbsenceInformation: vi.fn(),
}))
vi.mock('./vacation-coverage', () => ({ VacationCoverage: () => null }))
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
    mocks.from = ''
    mocks.to = ''
    mocks.picker = null
    vi.clearAllMocks()
  })

  it('provides status, worker, type and date filters for the absence inbox', () => {
    const html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html).toContain('Necesita información')
    expect(html).toContain('Buscar trabajador')
    expect(html).toContain('Todos los tipos')
    expect(html).toContain('Desde')
    expect(html).toContain('Hasta')
    expect(html).toContain('@container')
    expect(html).toContain('@min-[40rem]:grid-cols-4')
    expect(html).not.toContain('max-w-4xl')
    expect(html).not.toContain('Revisa cada solicitud')
    expect(html).not.toContain('type="date"')
    expect(mocks.picker?.mode).toBe('filter')
    mocks.picker?.onChange('2026-11-10', '2026-11-12')
    expect(mocks.setFrom).toHaveBeenCalledWith('2026-11-10')
    expect(mocks.setTo).toHaveBeenCalledWith('2026-11-12')
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
