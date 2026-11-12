import type * as ReactQuery from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { StaffSchedulesPage } from './staff-schedules-page'

const mocks = vi.hoisted(() => ({ query: vi.fn(), session: vi.fn() }))
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof ReactQuery>()),
  useQuery: mocks.query,
}))
vi.mock('@/features/auth', () => ({ useSession: mocks.session }))
vi.mock('@/features/settings/application/team-actions', () => ({
  teamQuery: () => ({ queryKey: ['team', 'company'] }),
}))
vi.mock('@/shared/ui/event-calendar', () => ({
  EventCalendar: ({ items }: { items: { id: string; title: string }[] }) => (
    <div>
      {items.map((item) => (
        <span key={item.id}>{item.title}</span>
      ))}
    </div>
  ),
}))

describe('staff schedule access and availability', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 16, 12))
    mocks.query.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      const data: Record<string, unknown> = {
        team: [
          { userId: 'ana', fullName: 'Ana', email: 'ana@example.com' },
          { userId: 'luis', fullName: 'Luis', email: 'luis@example.com' },
        ],
        'staff-functions': [{ id: 'electricidad', name: 'Electricidad' }],
        'staff-schedules': ['ana', 'luis'].map((userId) => ({
          userId,
          updatedAt: 'v1',
          functionIds: ['electricidad'],
          slots: [{ weekday: 1, start: 540, end: 1020 }],
        })),
        'staff-absences': [{ userId: 'ana', startDate: '2026-11-16', endDate: '2026-11-16' }],
      }
      return { isPending: false, isError: false, isSuccess: true, data: data[queryKey[0] ?? ''] }
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('shows the admin the team, but removes absent people from the calendar', () => {
    mocks.session.mockReturnValue({
      tenantId: 'company',
      userId: 'admin',
      fullName: 'Admin',
      role: 'admin',
    })
    const html = renderToStaticMarkup(<StaffSchedulesPage />)
    expect(html).toContain('Horarios del equipo')
    expect(html).toContain('Ana')
    expect(html).toContain('Luis')
    expect(html).toMatch(/Previstos ahora:<\/strong>\s*Luis/)
    const calendar = html.match(/<div><span[^>]*>Luis<\/span><\/div>/)
    expect(calendar).not.toBeNull()
    expect(html).not.toMatch(/<div><span[^>]*>Ana<\/span>/)
  })

  it('does not request the team or expose another person to a worker', () => {
    mocks.session.mockReturnValue({
      tenantId: 'company',
      userId: 'ana',
      fullName: 'Ana',
      role: 'user',
    })
    const html = renderToStaticMarkup(<StaffSchedulesPage />)
    expect(html).toContain('Mi horario')
    expect(html).toContain('Electricidad')
    expect(html).not.toContain('Luis')
    expect(
      mocks.query.mock.calls.find(([options]) => options.queryKey[0] === 'team')?.[0].enabled,
    ).toBe(false)
    expect(html).toContain('No hay franjas previstas')
  })
})
