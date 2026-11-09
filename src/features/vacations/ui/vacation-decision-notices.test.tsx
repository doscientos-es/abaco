import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VacationDecisionNotices } from './vacation-decision-notices'

const { query, mutation } = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: query,
  useMutation: mutation,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('../application/vacation-actions', () => ({
  listVacationDecisionNotifications: vi.fn(),
  readVacationDecisionNotification: vi.fn(),
}))

describe('VacationDecisionNotices', () => {
  beforeEach(() => {
    query.mockReset()
    mutation.mockReturnValue({ isPending: false, isError: false, mutate: vi.fn() })
  })

  it('shows the real decision with a link to its request and a read action', () => {
    query.mockReturnValue({
      data: [{ id: 'n1', requestId: 'r1', decision: 'approved', readAt: null }],
    })
    const html = renderToStaticMarkup(<VacationDecisionNotices tenantId="t1" />)
    expect(html).toContain('Tu solicitud ha sido aprobada')
    expect(html).toContain('href="#vacation-request-r1"')
    expect(html).toContain('Marcar como leído')
  })

  it('shows a failed load instead of an empty notice list', () => {
    query.mockReturnValue({ isPending: false, isError: true })
    expect(renderToStaticMarkup(<VacationDecisionNotices tenantId="t1" />)).toContain(
      'No se pudieron cargar los avisos de vacaciones',
    )
  })

  it('does not offer a read action for an already read rejection', () => {
    query.mockReturnValue({
      data: [{ id: 'n2', requestId: 'r2', decision: 'rejected', readAt: '2026-01-01' }],
    })
    const html = renderToStaticMarkup(<VacationDecisionNotices tenantId="t1" />)
    expect(html).toContain('Tu solicitud ha sido rechazada')
    expect(html).not.toContain('Marcar como leído')
  })
})
