import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkPlanningSearch } from '@/shared/domain/work-planning-search'
import type { CalendarEvent, CalendarEventChange } from '@/shared/lib/event-calendar'

import type { VisitSummary } from '../application/visit-actions'
import { AgendaPage } from './agenda-page'

const mocks = vi.hoisted(() => ({
  stateIndex: 0,
  open: false,
  valid: false,
  setOpen: vi.fn(),
  create: vi.fn(),
  invalidate: vi.fn(),
  error: vi.fn(),
  navigate: vi.fn(),
  search: {} as WorkPlanningSearch,
  visits: [] as VisitSummary[],
  selectedVisitId: null as string | null,
  role: 'admin',
  setSelected: vi.fn(),
  setReplan: vi.fn(),
  setProposal: vi.fn(),
  replan: null as VisitSummary | null,
  proposal: null as CalendarEventChange | null,
  replanProps: null as null | {
    proposal?: { localStart: string; durationMinutes: number }
    onDone: () => Promise<void>
  },
  change: undefined as undefined | ((change: CalendarEventChange) => void),
  events: [] as CalendarEvent[],
  queryKeys: [] as unknown[][],
  calendarIds: [] as string[],
  fields: new Map<string, (value: string) => void>(),
  calendarView: undefined as string | undefined,
  calendarValue: undefined as Date | undefined,
  buttons: new Map<string, () => void>(),
  dialog: null as null | { open: boolean; isDirty: boolean; onSubmit: () => void },
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = mocks.stateIndex++
      if (index === 0) return [mocks.selectedVisitId, mocks.setSelected]
      if (index === 1) return [mocks.open, mocks.setOpen]
      if (index === 3 && mocks.valid) return ['client-1', vi.fn()]
      if (index === 5 && mocks.valid) return ['Revisión', vi.fn()]
      if (index === 12) return [mocks.replan, mocks.setReplan]
      if (index === 14) return [mocks.proposal, mocks.setProposal]
      return actual.useState(initial)
    },
  }
})

vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    Button: ({
      children,
      onPress,
      'aria-label': ariaLabel,
    }: {
      children: ReactNode
      onPress?: () => void
      'aria-label'?: string
    }) => {
      if (ariaLabel && onPress) mocks.buttons.set(ariaLabel, onPress)
      if (typeof children === 'string' && onPress) mocks.buttons.set(children, onPress)
      if (Array.isArray(children) && onPress) mocks.buttons.set(String(children[1]), onPress)
      return <button>{children}</button>
    },
    Card: Container,
    CardContent: Container,
    CardHeader: Container,
    CardTitle: Container,
    toast: { success: vi.fn(), error: mocks.error },
  }
})
vi.mock('@/shared/ui/event-calendar', () => ({
  EventCalendar: ({
    view,
    value,
    items,
    onItemChange,
  }: {
    view: string
    value: Date
    items: CalendarEvent[]
    onItemChange?: (change: CalendarEventChange) => void
  }) => {
    mocks.calendarView = view
    mocks.calendarValue = value
    mocks.calendarIds = items.map((item) => item.id)
    mocks.events = items
    mocks.change = onItemChange
    return <div>Calendario de trabajos</div>
  },
}))
vi.mock('@/shared/ui/calendar-details-dialog', () => ({
  CalendarDetailsDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@tanstack/react-query', () => ({
  queryOptions: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    mocks.queryKeys.push(queryKey)
    return {
      data:
        queryKey[0] === 'work-target-options'
          ? { locations: [] }
          : queryKey[0] === 'office-visits'
            ? mocks.visits
            : [],
    }
  },
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useSearch: () => mocks.search,
}))
vi.mock('@/features/auth', () => ({
  useSession: () => ({ tenantId: 'tenant-1', role: mocks.role }),
}))
vi.mock('./report-review-inbox', () => ({ ReportReviewInbox: () => null }))
vi.mock('@/features/clients/ui/related-record-creation', () => ({
  RelatedCreateButton: () => null,
  useRelatedRecordCreation: () => ({
    pending: false,
    status: null,
    allowed: false,
    creating: false,
    dialogs: null,
    start: vi.fn(),
  }),
}))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({ tenant: { id: 'tenant-1' }, clients: [] }),
}))
vi.mock('@/features/work-orders/application/work-order-actions', () => ({
  loadWorkTargetOptions: vi.fn(),
}))
vi.mock('../application/visit-actions', () => ({
  createServiceVisit: mocks.create,
  listOfficeVisits: vi.fn(),
  listPlanningVisits: vi.fn(),
  listTechnicians: vi.fn(),
}))
vi.mock('@/shared/ui/form', () => {
  const Field = ({ label, onChange }: { label: string; onChange: (value: string) => void }) => {
    mocks.fields.set(label, onChange)
    return <span>{label}</span>
  }
  return { SelectField: Field, TextField: Field }
})
vi.mock('@/shared/ui/form-dialog', () => ({
  FormDialog: (props: {
    open: boolean
    isDirty: boolean
    onSubmit: () => void
    children: ReactNode
  }) => {
    mocks.dialog = props
    return props.open ? <dialog open>{props.children}</dialog> : null
  },
}))
vi.mock('./visit-replan-form', () => ({
  VisitReplanForm: (props: NonNullable<typeof mocks.replanProps>) => {
    mocks.replanProps = props
    return null
  },
}))
vi.mock('./visit-report-editor', () => ({ VisitReportEditor: () => null }))
vi.mock('./batch-work-sheets', () => ({ BatchWorkSheets: () => null }))

function render() {
  mocks.stateIndex = 0
  return renderToStaticMarkup(<AgendaPage />)
}

describe('AgendaPage: nueva visita', () => {
  beforeEach(() => {
    mocks.open = false
    mocks.valid = false
    mocks.search = {}
    mocks.calendarView = undefined
    mocks.calendarValue = undefined
    mocks.visits = []
    mocks.selectedVisitId = null
    mocks.role = 'admin'
    mocks.replan = null
    mocks.proposal = null
    mocks.replanProps = null
    mocks.change = undefined
    mocks.events = []
    mocks.queryKeys = []
    mocks.calendarIds = []
    mocks.fields.clear()
    mocks.buttons.clear()
    mocks.dialog = null
    vi.clearAllMocks()
    mocks.create.mockResolvedValue('visit-1')
    mocks.invalidate.mockResolvedValue(undefined)
  })

  it('muestra la agenda sin el formulario y lo abre mediante el botón', () => {
    const html = render()
    expect(html).toContain('Nueva visita')
    expect(html).toContain('Lista de trabajos')
    expect(html).toContain('Calendario')
    expect(html).not.toContain('Asunto')
    expect(mocks.dialog?.open).toBe(false)
    mocks.buttons.get('Nueva visita')?.()
    expect(mocks.setOpen).toHaveBeenCalledWith(true)

    mocks.open = true
    expect(render()).toContain('Asunto')
    expect(mocks.dialog?.open).toBe(true)
  })

  it('renders the calendar week for the date in the URL', () => {
    mocks.search = { view: 'calendar', date: '2026-06-10', period: 'week' }

    expect(render()).toContain('Calendario de trabajos')
    expect(mocks.calendarView).toBe('week')
    expect(mocks.calendarValue?.getDate()).toBe(10)
  })

  it('permite elegir un centro sin ofrecer activos ni piscinas', () => {
    mocks.open = true
    const html = render()
    expect(html).toContain('Centro')
    expect(html).not.toMatch(/piscina|activo|mediciones/i)
  })

  it('defaults the calendar to a month and supports a day view', () => {
    mocks.search = { view: 'calendar', date: '2026-11-13' }
    render()
    expect(mocks.calendarView).toBe('month')
    expect(mocks.queryKeys.find((key) => key[0] === 'office-visits')?.slice(2, 4)).toEqual([
      '2026-10-26',
      '2026-12-06',
    ])
    mocks.search.period = 'day'
    render()
    expect(mocks.calendarView).toBe('day')
  })

  it('uses the same records, date range and filters in the list and calendar', () => {
    mocks.visits = [
      {
        id: 'visible',
        title: 'Cristales TEST',
        client_name: 'Oficinas TEST',
        location_name: 'Sede',
        address: '',
        timezone: 'Europe/Madrid',
        scheduled_start_at: '2026-11-13T09:00:00Z',
        scheduled_end_at: '2026-11-13T10:00:00Z',
        status: 'scheduled',
        priority: 'normal',
        notes: '',
        updated_at: 'version',
        work_team_id: null,
      },
      {
        id: 'hidden',
        title: 'Otro TEST',
        client_name: 'Otro cliente',
        location_name: '',
        address: '',
        timezone: 'Europe/Madrid',
        scheduled_start_at: '2026-11-13T11:00:00Z',
        scheduled_end_at: '2026-11-13T12:00:00Z',
        status: 'completed',
        priority: 'normal',
        notes: '',
        updated_at: 'version',
      },
    ]
    mocks.search = {
      date: '2026-11-13',
      period: 'week',
      team: 'unassigned',
      status: 'scheduled',
      q: 'Oficinas',
    }
    const list = render()
    expect(list).toContain('Cristales TEST')
    expect(list).not.toContain('Otro TEST')
    expect(list).toContain('Reprogramar')
    expect(list).toContain('Ver parte')
    const listQuery = mocks.queryKeys.find((key) => key[0] === 'office-visits')
    mocks.buttons.get('Calendario')?.()
    const navigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
      to: string
      search: (previous: WorkPlanningSearch) => WorkPlanningSearch
    }
    expect(navigation.to).toBe('/trabajos')
    mocks.search = navigation.search(mocks.search)
    expect(mocks.search).toEqual({
      view: 'calendar',
      date: '2026-11-13',
      period: 'week',
      team: 'unassigned',
      status: 'scheduled',
      q: 'Oficinas',
    })
    mocks.selectedVisitId = 'visible'
    mocks.queryKeys = []
    const calendar = render()
    expect(mocks.calendarIds).toEqual(['visible'])
    expect(mocks.queryKeys.find((key) => key[0] === 'office-visits')).toEqual(listQuery)
    expect(listQuery?.slice(2, 4)).toEqual(['2026-11-09', '2026-11-15'])
    expect(calendar).toContain('Reprogramar')
    expect(calendar).toContain('Ver parte')
  })

  it('keeps the default month when switching views and moves one day in daily planning', () => {
    mocks.search = { date: '2026-11-13', period: 'day' }
    render()
    mocks.buttons.get('Periodo siguiente')?.()
    const navigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: WorkPlanningSearch) => WorkPlanningSearch
    }
    expect(navigation.search(mocks.search)).toMatchObject({ date: '2026-11-14', period: 'day' })
    mocks.search = { date: '2026-11-13' }
    mocks.queryKeys = []
    render()
    expect(mocks.queryKeys.find((key) => key[0] === 'office-visits')?.slice(2, 4)).toEqual([
      '2026-11-01',
      '2026-11-30',
    ])
    mocks.buttons.get('Calendario')?.()
    const switchView = mocks.navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: WorkPlanningSearch) => WorkPlanningSearch
    }
    expect(switchView.search(mocks.search)).toMatchObject({
      view: 'calendar',
      date: '2026-11-13',
      period: 'month',
    })
  })

  it('updates shareable filters without dropping the selected view or period', () => {
    mocks.search = { view: 'calendar', date: '2026-11-13', period: 'week', q: 'Oficinas' }
    render()
    mocks.fields.get('Equipo')?.('unassigned')
    const navigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: WorkPlanningSearch) => WorkPlanningSearch
    }
    expect(navigation.search(mocks.search)).toEqual({ ...mocks.search, team: 'unassigned' })
  })

  it('clears planning filters without changing the date, period or view', () => {
    mocks.search = {
      view: 'calendar',
      date: '2026-11-13',
      period: 'week',
      technician: 'unassigned',
      team: 'unassigned',
      status: 'scheduled',
      q: 'Oficina',
    }
    render()
    expect(mocks.buttons.has('Limpiar filtros')).toBe(true)
    mocks.buttons.get('Limpiar filtros')?.()
    const navigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: WorkPlanningSearch) => WorkPlanningSearch
    }
    expect(navigation.search(mocks.search)).toEqual({
      view: 'calendar',
      date: '2026-11-13',
      period: 'week',
      technician: undefined,
      team: undefined,
      status: undefined,
      q: undefined,
    })
  })

  it('guarda, actualiza la agenda y cierra el diálogo', async () => {
    mocks.open = true
    mocks.valid = true
    render()
    expect(mocks.dialog?.isDirty).toBe(true)
    mocks.dialog?.onSubmit()
    await vi.waitFor(() => expect(mocks.setOpen).toHaveBeenCalledWith(false))
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', clientId: 'client-1', title: 'Revisión' }),
    )
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['office-visits', 'tenant-1'] })
  })

  it('mantiene el diálogo abierto si falla la creación', async () => {
    mocks.open = true
    mocks.valid = true
    mocks.create.mockRejectedValue(new Error('Sin conexión'))
    render()
    mocks.dialog?.onSubmit()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalled())
    expect(mocks.setOpen).not.toHaveBeenCalledWith(false)
  })

  it('opens the proposed move for confirmation in the visit timezone and refreshes affected screens on save', async () => {
    const visit: VisitSummary = {
      id: 'move',
      title: 'Cristales',
      client_name: 'TEST',
      location_name: '',
      address: '',
      timezone: 'Europe/Madrid',
      scheduled_start_at: '2026-11-13T08:00:00Z',
      scheduled_end_at: '2026-11-13T09:00:00Z',
      status: 'scheduled',
      priority: 'normal',
      notes: '',
      updated_at: 'version',
    }
    mocks.visits = [visit]
    mocks.search = { view: 'calendar', date: '2026-11-13', period: 'week' }
    render()
    const item = mocks.events[0]
    if (!item) throw new Error('Missing event')
    expect(item.start.getHours()).toBe(9)
    expect(item.editable).toBe(true)
    const change: CalendarEventChange = {
      item,
      start: new Date(2026, 10, 14, 11),
      end: new Date(2026, 10, 14, 12, 30),
      kind: 'resize',
    }
    mocks.change?.({ ...change, item: { ...item, revision: 'old-version' } })
    expect(mocks.setReplan).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalled()
    mocks.change?.(change)
    expect(mocks.setSelected).toHaveBeenCalledWith(visit.id)
    expect(mocks.setReplan).toHaveBeenCalledWith(visit)
    expect(mocks.setProposal).toHaveBeenCalledWith(change)
    mocks.selectedVisitId = visit.id
    mocks.replan = visit
    mocks.proposal = change
    render()
    expect(mocks.replanProps?.proposal).toEqual({
      localStart: '2026-11-14T11:00',
      durationMinutes: 90,
    })
    await mocks.replanProps?.onDone()
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['my-visits', 'tenant-1'] })
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['vacation-coverage', 'tenant-1'] })
    mocks.role = 'user'
    render()
    expect(mocks.events[0]?.editable).toBe(false)
    expect(mocks.change).toBeUndefined()
    mocks.role = 'admin'
    mocks.visits = [{ ...visit, status: 'completed' }]
    render()
    expect(mocks.events[0]?.editable).toBe(false)
  })
})
