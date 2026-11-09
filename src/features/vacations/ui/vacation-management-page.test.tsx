import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VacationManagementPage } from './vacation-management-page'

const mocks = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
}))

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
  })

  it('provides status, worker, type and date filters for the absence inbox', () => {
    const html = renderToStaticMarkup(<VacationManagementPage />)
    expect(html).toContain('Necesita información')
    expect(html).toContain('Buscar trabajador')
    expect(html).toContain('Todos los tipos')
    expect(html).toContain('Desde')
    expect(html).toContain('Hasta')
  })
})
