import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VacationManagementPage } from './vacation-management-page'

const mocks = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
  filterNeedsInfo: false,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const [value, setValue] = actual.useState(initial)
      return mocks.filterNeedsInfo && initial === 'pending'
        ? ['needs_info', setValue]
        : [value, setValue]
    },
  }
})

vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
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
vi.mock('./vacation-request-card', () => ({
  VacationRequestCard: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

describe('VacationManagementPage', () => {
  beforeEach(() => {
    mocks.data = []
    mocks.filterNeedsInfo = false
  })

  it('provides status, worker, type and date filters for the absence inbox', () => {
    const html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html).toContain('Necesita información')
    expect(html).toContain('Buscar trabajador')
    expect(html).toContain('Todos los tipos')
    expect(html).toContain('Desde')
    expect(html).toContain('Hasta')
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
