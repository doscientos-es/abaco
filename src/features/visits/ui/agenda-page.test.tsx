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
  replan: vi.fn(),
  replanContract: vi.fn(),
  invalidate: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  navigate: vi.fn(),
  search: {} as WorkPlanningSearch,
  visits: [] as VisitSummary[],
  selectedVisitId: null as string | null,
  role: 'admin',
  setSelected: vi.fn(),
  setReplanning: vi.fn(),
  setPending: vi.fn(),
  change: undefined as undefined | ((change: CalendarEventChange) => void),
  click: undefined as undefined | ((item: CalendarEvent) => void),
  events: [] as CalendarEvent[],
  queryKeys: [] as unknown[][],
  calendarIds: [] as string[],
  fields: new Map<string, (value: string) => void>(),
  calendarView: undefined as string | undefined,
  calendarValue: undefined as Date | undefined,
  calendarShowInstructions: undefined as boolean | undefined,
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
      if (index === 12) return [null, mocks.setReplanning]
      if (index === 14) return [{}, mocks.setPending]
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
      return <button aria-label={ariaLabel}>{children}</button>
    },
    Input: ({
      'aria-label': label,
      onChange,
    }: {
      'aria-label': string
      onChange: (event: { target: { value: string } }) => void
    }) => {
      mocks.fields.set(label, (value) => onChange({ target: { value } }))
      return <input aria-label={label} />
    },
    Card: Container,
    CardContent: Container,
    CardHeader: Container,
    CardTitle: Container,
    Popover: ({ trigger, children }: { trigger: ReactNode; children: ReactNode }) => (
      <>
        {trigger}
        {children}
      </>
    ),
    toast: { success: mocks.success, error: mocks.error },
  }
})
vi.mock('@/shared/ui/event-calendar', () => ({
  EventCalendar: ({
    view,
    value,
    items,
    onItemClick,
    onItemChange,
    showInstructions,
  }: {
    view: string
    value: Date
    items: CalendarEvent[]
    onItemClick: (item: CalendarEvent) => void
    onItemChange?: (change: CalendarEventChange) => void
    showInstructions?: boolean
  }) => {
    mocks.calendarView = view
    mocks.calendarValue = value
    mocks.calendarShowInstructions = showInstructions
    mocks.calendarIds = items.map((item) => item.id)
    mocks.events = items
    mocks.change = onItemChange
    mocks.click = onItemClick
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
  replanServiceVisit: mocks.replan,
  replanContractDay: mocks.replanContract,
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
vi.mock('./visit-replan-form', () => ({ VisitReplanForm: () => null }))
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
    mocks.calendarShowInstructions = undefined
    mocks.visits = []
    mocks.selectedVisitId = null
    mocks.role = 'admin'
    mocks.change = undefined
    mocks.click = undefined
    mocks.events = []
    mocks.queryKeys = []
    mocks.calendarIds = []
    mocks.fields.clear()
    mocks.buttons.clear()
    mocks.dialog = null
    vi.clearAllMocks()
    mocks.create.mockResolvedValue('visit-1')
    mocks.replan.mockResolvedValue(undefined)
    mocks.replanContract.mockResolvedValue(undefined)
    mocks.invalidate.mockResolvedValue(undefined)
  })

  it('muestra la agenda sin el formulario y lo abre mediante el botón', () => {
    const html = render()
    expect(html).toContain('Nueva visita')
    expect(html).not.toContain('Lista de trabajos')
    expect(html).not.toContain('Consulta las visitas de contratos')
    expect(html).toContain('Calendario de trabajos')
    expect(mocks.buttons.has('Día')).toBe(true)
    expect(mocks.buttons.has('Semana')).toBe(true)
    expect(mocks.buttons.has('Mes')).toBe(true)
    for (const field of [
      'Fecha de referencia',
      'Técnico',
      'Equipo',
      'Estado',
      'Buscar cliente o centro',
    ]) {
      expect(mocks.fields.has(field)).toBe(true)
    }
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

    const html = render()
    expect(html).toContain('Calendario de trabajos')
    expect(html).not.toContain('No hay trabajos en este periodo con estos filtros')
    expect(mocks.calendarView).toBe('week')
    expect(mocks.calendarValue?.getDate()).toBe(10)
    expect(mocks.calendarShowInstructions).toBe(false)
  })

  it('permite elegir un centro sin ofrecer activos ni piscinas', () => {
    mocks.open = true
    const html = render()
    expect(html).toContain('Centro')
    expect(html).not.toMatch(/piscina|activo|mediciones/i)
  })

  it('defaults the calendar to a month and supports a day view', () => {
    mocks.search = { date: '2026-11-13' }
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
        address: 'Calle Ávila & 4',
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
      view: 'list',
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
    expect(list).toContain('destination=Calle+%C3%81vila+%26+4')
    expect(list).toContain('La dirección puede estar incompleta. Comprueba la localidad')
    expect(list).toContain('rel="noopener noreferrer"')
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
    render()
    const event = mocks.events[0]
    if (!event) throw new Error('Missing visit event')
    mocks.click?.(event)
    expect(mocks.setSelected).toHaveBeenCalledWith('visible')
    expect(mocks.setReplanning).toHaveBeenCalledWith(mocks.visits[0])
    expect(mocks.replan).not.toHaveBeenCalled()
    mocks.selectedVisitId = 'visible'
    mocks.queryKeys = []
    const calendar = render()
    expect(mocks.calendarIds).toEqual(['visible'])
    expect(mocks.queryKeys.find((key) => key[0] === 'office-visits')).toEqual(listQuery)
    expect(listQuery?.slice(2, 4)).toEqual(['2026-11-09', '2026-11-15'])
    expect(calendar).toContain('Reprogramar')
    expect(calendar).toContain('Ver parte')
    expect(calendar).toContain('destination=Calle+%C3%81vila+%26+4')
    expect(calendar).toContain('La dirección puede estar incompleta. Comprueba la localidad')
  })

  it('keeps the default month when switching views and moves one day in daily planning', () => {
    mocks.search = { date: '2026-11-13', period: 'day' }
    render()
    mocks.buttons.get('Periodo siguiente')?.()
    const navigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: WorkPlanningSearch) => WorkPlanningSearch
    }
    expect(navigation.search(mocks.search)).toMatchObject({ date: '2026-11-14', period: 'day' })
    mocks.search = { date: '2026-11-13', view: 'list' }
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

  it('keeps search visible and indicates active secondary filters', () => {
    mocks.search = {
      view: 'calendar',
      date: '2026-11-13',
      period: 'week',
      technician: 'unassigned',
      status: 'scheduled',
    }
    const html = render()
    expect(html.indexOf('aria-label="Buscar cliente o centro"')).toBeLessThan(
      html.indexOf('Filtros adicionales, 2 activos'),
    )
    expect(html).toContain('Filtros adicionales, 2 activos')
    mocks.fields.get('Buscar cliente o centro')?.('Oficinas')
    const navigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: WorkPlanningSearch) => WorkPlanningSearch
    }
    expect(navigation.search(mocks.search)).toEqual({ ...mocks.search, q: 'Oficinas' })
    mocks.buttons.get('Quitar filtro Estado: Planificada')?.()
    const clearStatus = mocks.navigate.mock.calls.at(-1)?.[0] as typeof navigation
    expect(clearStatus.search(mocks.search)).toEqual({ ...mocks.search, status: undefined })
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

  it('saves the dropped local time directly without changing the assignment or duration', async () => {
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
      assigned_user_id: 'technician-1',
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
      kind: 'move',
    }
    mocks.change?.({ ...change, item: { ...item, revision: 'old-version' } })
    expect(mocks.replan).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalled()
    mocks.change?.(change)
    mocks.change?.(change)
    expect(mocks.setSelected).not.toHaveBeenCalled()
    expect(mocks.replan).toHaveBeenCalledTimes(1)
    expect(mocks.replan).toHaveBeenCalledWith(
      expect.objectContaining({
        visitId: visit.id,
        expectedUpdatedAt: 'version',
        localStart: '2026-11-14T11:00',
        durationMinutes: 60,
        assignedUserId: 'technician-1',
        operationId: expect.any(String),
      }),
    )
    await vi.waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith('Trabajo reprogramado', {
        description: expect.stringContaining('11:00'),
      }),
    )
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['office-visits', 'tenant-1'] })
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['my-visits', 'tenant-1'] })
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['vacation-coverage', 'tenant-1'] })
    mocks.role = 'user'
    render()
    const event = mocks.events[0]
    if (!event) throw new Error('Missing visit event')
    expect(event.editable).toBe(false)
    mocks.click?.(event)
    expect(mocks.setSelected).toHaveBeenCalledWith(event.id)
    expect(mocks.setReplanning).toHaveBeenLastCalledWith(null)
    expect(mocks.change).toBeUndefined()
    mocks.role = 'admin'
    mocks.visits = [{ ...visit, status: 'completed' }]
    render()
    expect(mocks.events[0]?.editable).toBe(false)
  })

  it('groups a contract and opens its individual jobs, including jobs hidden by a filter', async () => {
    const visit: VisitSummary = {
      id: 'one',
      title: 'Fregar',
      client_name: 'Cliente',
      location_name: '',
      address: '',
      timezone: 'Europe/Madrid',
      scheduled_start_at: '2026-11-13T08:00:00Z',
      scheduled_end_at: '2026-11-13T09:00:00Z',
      status: 'scheduled',
      priority: 'normal',
      notes: '',
      updated_at: 'version',
      contract_id: 'contract',
      contract_title: 'Oficina',
      assigned_user_id: 'worker-one',
    }
    mocks.visits = [
      visit,
      {
        ...visit,
        id: 'two',
        title: 'Cristales',
        assigned_user_id: 'worker-two',
        scheduled_start_at: '2026-11-13T09:00:00Z',
        scheduled_end_at: '2026-11-13T10:00:00Z',
      },
    ]
    mocks.search = {
      view: 'calendar',
      date: '2026-11-13',
      period: 'week',
      technician: 'worker-one',
    }
    render()
    expect(mocks.calendarIds).toEqual(['contract:contract:2026-11-13'])
    expect(mocks.events.every((event) => event.editable)).toBe(true)
    const event = mocks.events[0]
    if (!event) throw new Error('Missing event')
    expect(event.title).toBe('Oficina')
    expect(event.resizable).toBe(false)
    mocks.change?.({
      item: event,
      kind: 'move',
      start: new Date(2026, 10, 14, 9),
      end: new Date(2026, 10, 14, 11),
    })
    await vi.waitFor(() =>
      expect(mocks.replanContract).toHaveBeenCalledWith(
        expect.objectContaining({
          contractId: 'contract',
          sourceDate: '2026-11-13',
          shiftMinutes: 1440,
          visits: [
            { id: 'one', updated_at: 'version' },
            { id: 'two', updated_at: 'version' },
          ],
        }),
      ),
    )
    mocks.click?.(event)
    expect(mocks.setSelected).toHaveBeenCalledWith(event.id)
    expect(mocks.setReplanning).toHaveBeenLastCalledWith(null)
    mocks.selectedVisitId = event.id
    const html = render()
    expect(html).toContain('Fregar')
    expect(html).toContain('Cristales')
    expect(html).toContain('Reprogramar')
    expect(html).toContain('Ver parte')
    const secondVisit = mocks.visits[1]
    if (!secondVisit) throw new Error('Missing second visit')
    mocks.visits = [visit, { ...secondVisit, status: 'completed' }]
    render()
    expect(mocks.events[0]?.editable).toBe(false)
  })

  it('restores a failed optimistic move and retries it with the same operation id', async () => {
    mocks.visits = [
      {
        id: 'visit',
        title: 'Revisión',
        client_name: 'TEST',
        location_name: '',
        address: '',
        timezone: 'Europe/Madrid',
        status: 'scheduled',
        priority: 'normal',
        notes: '',
        updated_at: 'version',
        scheduled_start_at: '2026-11-13T08:00:00Z',
        scheduled_end_at: '2026-11-13T09:00:00Z',
      },
    ]
    mocks.search = { date: '2026-11-13', period: 'day' }
    mocks.replan.mockRejectedValueOnce(new Error('Sin conexión'))
    render()
    const item = mocks.events[0]
    if (!item) throw new Error('Missing event')
    const change: CalendarEventChange = {
      item,
      kind: 'move',
      start: new Date(2026, 10, 12, 9),
      end: new Date(2026, 10, 12, 10),
    }
    mocks.change?.(change)
    await vi.waitFor(() => expect(mocks.setPending).toHaveBeenCalledTimes(2))
    const add = mocks.setPending.mock.calls[0]?.[0]
    const undo = mocks.setPending.mock.calls[1]?.[0]
    expect(add({})).toEqual({ visit: change })
    expect(undo({ visit: change })).toEqual({})
    expect(mocks.error).toHaveBeenCalledWith('No se pudo reprogramar el trabajo', {
      description: 'Sin conexión',
    })
    mocks.change?.(change)
    expect(mocks.replan).toHaveBeenCalledTimes(2)
    expect(mocks.replan.mock.calls[1]?.[0]).toEqual(mocks.replan.mock.calls[0]?.[0])
    await vi.waitFor(() => expect(mocks.success).toHaveBeenCalled())
  })
})
