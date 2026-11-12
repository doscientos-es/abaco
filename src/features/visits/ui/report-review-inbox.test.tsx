import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportReviewInbox, ReportReviewTabLabel } from './report-review-inbox'

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  button: vi.fn(),
  review: vi.fn(),
  download: vi.fn(),
  invalidate: vi.fn(),
  error: vi.fn(),
  openedData: null as object | null,
  reportProps: vi.fn(),
  hasMore: false,
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: mocks.state,
}))
vi.mock('@doscientos/ui', () => ({
  Button: mocks.button,
  toast: { success: vi.fn(), error: mocks.error },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === 'pending-report-reviews'
      ? {
          isSuccess: true,
          data: {
            items: [
              {
                report_version_id: 'version',
                visit_id: 'visit',
                version: 2,
                closed_at: '2026-11-10T10:00:00Z',
                visit_title: 'Visita',
                client_name: 'Cliente',
              },
            ],
            hasMore: mocks.hasMore,
          },
        }
      : { data: mocks.openedData },
}))
vi.mock('../application/report-review-actions', () => ({
  listPendingReportReviews: vi.fn(),
  reviewClosedReport: mocks.review,
  downloadClosedReportPdf: mocks.download,
}))
vi.mock('../application/visit-report-actions', () => ({ loadClosedVisitReportVersion: vi.fn() }))
vi.mock('./closed-visit-report', () => ({ ClosedVisitReport: mocks.reportProps }))

describe('report review inbox', () => {
  let values: unknown[]
  let cursor: number
  function render() {
    cursor = 0
    mocks.button.mockClear()
    return renderToStaticMarkup(<ReportReviewInbox tenantId="company" />)
  }
  function button(label: string) {
    const props = mocks.button.mock.calls.find(([item]) => item.children === label)?.[0]
    if (!props) throw new Error(`Button not found: ${label}`)
    return props
  }

  beforeEach(() => {
    vi.resetAllMocks()
    values = []
    cursor = 0
    mocks.openedData = null
    mocks.hasMore = false
    mocks.state.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in values)) values[index] = initial
      return [
        values[index],
        (value: unknown) => {
          values[index] = value
        },
      ]
    })
    mocks.button.mockImplementation(({ children }: { children: React.ReactNode }) => (
      <button>{children}</button>
    ))
    mocks.reportProps.mockReturnValue(null)
    mocks.invalidate.mockResolvedValue(undefined)
  })

  it('opens the exact version and requires it to load before review', async () => {
    expect(render()).toContain('Visita · Cliente · versión 2')
    button('Revisar parte').onPress()
    render()
    expect(mocks.reportProps).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'company', visitId: 'visit', versionId: 'version' }),
      undefined,
    )
    expect(button('Marcar como revisado').isDisabled).toBe(true)
    mocks.openedData = { id: 'version' }
    mocks.review.mockResolvedValue(undefined)
    render()
    expect(button('Marcar como revisado').isDisabled).toBe(false)
    button('Marcar como revisado').onPress()
    await vi.waitFor(() =>
      expect(mocks.invalidate).toHaveBeenCalledWith({
        queryKey: ['pending-report-reviews', 'company'],
      }),
    )
    expect(mocks.review).toHaveBeenCalledWith('company', 'version')
    expect(render()).not.toContain('Marcar como revisado')
  })

  it('keeps the report open when review fails', async () => {
    mocks.openedData = { id: 'version' }
    mocks.review.mockRejectedValue(new Error('network'))
    render()
    button('Revisar parte').onPress()
    render()
    button('Marcar como revisado').onPress()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalled())
    expect(render()).toContain('Marcar como revisado')
    expect(mocks.invalidate).not.toHaveBeenCalled()
  })

  it('keeps pending reports visible in the navigation, including overflow', () => {
    expect(renderToStaticMarkup(<ReportReviewTabLabel tenantId="company" />)).toContain(
      'Pendientes:',
    )
    mocks.hasMore = true
    expect(renderToStaticMarkup(<ReportReviewTabLabel tenantId="company" />)).toContain('1+')
  })
})
