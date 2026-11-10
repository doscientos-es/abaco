import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  search: {} as { view?: 'list' | 'calendar'; date?: string; period?: 'day' | 'week' | 'month' },
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
      if (index === 2) return [mocks.open, mocks.setOpen]
      if (index === 4 && mocks.valid) return ['client-1', vi.fn()]
      if (index === 7 && mocks.valid) return ['Revisión', vi.fn()]
      return actual.useState(initial)
    },
  }
})

vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    Button: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => {
      if (typeof children === 'string' && onPress) mocks.buttons.set(children, onPress)
      if (Array.isArray(children) && onPress) mocks.buttons.set(String(children[1]), onPress)
      return <button>{children}</button>
    },
    Card: Container,
    CardContent: Container,
    CardHeader: Container,
    CardTitle: Container,
    Calendar: ({ view, value }: { view?: string; value?: Date }) => {
      mocks.calendarView = view
      mocks.calendarValue = value
      return <div>Calendario semanal de visitas</div>
    },
    toast: { success: vi.fn(), error: mocks.error },
  }
})
vi.mock('@tanstack/react-query', () => ({
  queryOptions: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === 'work-target-options' ? { locations: [], assets: [] } : [],
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useSearch: () => mocks.search,
}))
vi.mock('@/features/auth', () => ({ useSession: () => ({ tenantId: 'tenant-1' }) }))
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
  listAllOfficeVisits: vi.fn(),
  listTechnicians: vi.fn(),
}))
vi.mock('@/shared/ui/form', () => ({
  SelectField: ({ label }: { label: string }) => <span>{label}</span>,
  TextField: ({ label }: { label: string }) => <span>{label}</span>,
}))
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
    mocks.buttons.clear()
    mocks.dialog = null
    vi.clearAllMocks()
    mocks.create.mockResolvedValue('visit-1')
    mocks.invalidate.mockResolvedValue(undefined)
  })

  it('muestra la agenda sin el formulario y lo abre mediante el botón', () => {
    const html = render()
    expect(html).toContain('Nueva visita')
    expect(html).toContain('Lista de visitas')
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

    expect(render()).toContain('Calendario semanal de visitas')
    expect(mocks.calendarView).toBe('week')
    expect(mocks.calendarValue?.getDate()).toBe(10)
  })

  it('defaults the calendar to a month and supports a day view', () => {
    mocks.search = { view: 'calendar', date: '2026-11-13' }
    render()
    expect(mocks.calendarView).toBe('month')
    mocks.search.period = 'day'
    render()
    expect(mocks.calendarView).toBe('day')
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
})
