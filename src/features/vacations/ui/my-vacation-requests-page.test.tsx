import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MyVacationRequestsPage } from './my-vacation-requests-page'

const mocks = vi.hoisted(() => ({
  stateIndex: 0,
  open: false,
  start: '',
  end: '',
  requests: [] as Array<Record<string, unknown>>,
  absenceType: 'vacation',
  setOpen: vi.fn(),
  setStart: vi.fn(),
  setEnd: vi.fn(),
  mutate: vi.fn(),
  invalidate: vi.fn(),
  onOpen: null as null | (() => void),
  dialog: null as null | { open: boolean; isDirty: boolean; onSubmit: () => void },
  picker: null as null | {
    start: string
    end: string
    endOptional: boolean
    onChange: (start: string, end: string) => void
  },
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = mocks.stateIndex++
      if (index === 0) return [mocks.open, mocks.setOpen]
      if (index === 1) return [mocks.absenceType, vi.fn()]
      if (index === 2) return [mocks.start, mocks.setStart]
      if (index === 3) return [mocks.end, mocks.setEnd]
      return actual.useState(initial)
    },
  }
})
vi.mock('@doscientos/ui', () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => {
    mocks.onOpen = onPress
    return <button>{children}</button>
  },
  Textarea: () => <textarea />,
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: () => ({ data: mocks.requests }),
  useMutation: () => ({ isPending: false, mutate: mocks.mutate }),
}))
vi.mock('@/features/auth', () => ({ useSession: () => ({ tenantId: 'tenant-1' }) }))
vi.mock('../application/vacation-actions', () => ({
  listVacationRequests: vi.fn(),
  submitVacationRequest: vi.fn(),
}))
vi.mock('./vacation-decision-notices', () => ({ VacationDecisionNotices: () => null }))
vi.mock('./absence-date-range-picker', () => ({
  AbsenceDateRangePicker: (props: NonNullable<typeof mocks.picker>) => {
    mocks.picker = props
    return <div>Fechas de la ausencia</div>
  },
}))
vi.mock('./vacation-request-card', () => ({
  VacationRequestCard: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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

function render() {
  mocks.stateIndex = 0
  return renderToStaticMarkup(<MyVacationRequestsPage />)
}

describe('Solicitud de vacaciones', () => {
  beforeEach(() => {
    mocks.open = false
    mocks.start = ''
    mocks.end = ''
    mocks.requests = []
    mocks.absenceType = 'vacation'
    mocks.onOpen = null
    mocks.dialog = null
    mocks.picker = null
    vi.clearAllMocks()
  })

  it('muestra el formulario solo después de solicitarlo', () => {
    const html = render()
    expect(html).toContain('<h1 class="text-xl font-semibold">Mis ausencias</h1>')
    expect(html).not.toContain('Tu tiempo, bien organizado')
    expect(html).not.toContain('Aquí podrás seguir cada solicitud')
    expect(html).toContain('Solicitar ausencia')
    expect(html).toContain('Mis solicitudes')
    expect(html).not.toContain('Hasta, incluido')
    mocks.onOpen?.()
    expect(mocks.setOpen).toHaveBeenCalledWith(true)

    mocks.open = true
    const openedHtml = render()
    expect(openedHtml).toContain('No incluyas información médica privada')
    expect(openedHtml).toContain('Fechas de la ausencia')
    expect(openedHtml).not.toContain('type="date"')
    expect(mocks.picker?.endOptional).toBe(false)
  })

  it('indica que la fecha final puede omitirse en otros tipos de ausencia', () => {
    mocks.open = true
    mocks.absenceType = 'sick_leave'
    render()
    expect(mocks.picker?.endOptional).toBe(true)
    mocks.picker?.onChange('2026-11-10', '2026-11-12')
    expect(mocks.setStart).toHaveBeenCalledWith('2026-11-10')
    expect(mocks.setEnd).toHaveBeenCalledWith('2026-11-12')
  })

  it('permite enviar un periodo válido desde el diálogo', () => {
    mocks.open = true
    mocks.start = '2026-11-10'
    mocks.end = '2026-11-12'
    render()
    expect(mocks.dialog?.isDirty).toBe(true)
    mocks.dialog?.onSubmit()
    expect(mocks.mutate).toHaveBeenCalledOnce()
  })

  it('exige fecha final para vacaciones pero permite una baja sin fecha final', () => {
    mocks.open = true
    mocks.start = '2026-11-10'
    render()
    mocks.dialog?.onSubmit()
    expect(mocks.mutate).not.toHaveBeenCalled()

    mocks.absenceType = 'sick_leave'
    render()
    mocks.dialog?.onSubmit()
    expect(mocks.mutate).toHaveBeenCalledOnce()
  })

  it('lets the worker answer an admin information request', () => {
    mocks.requests = [
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
        informationRequestComment: 'Confirma la fecha prevista.',
        requesterResponseComment: '',
      },
    ]
    const html = render()
    expect(html).toContain('Tu respuesta')
    expect(html).toContain('Enviar información')
  })
})
