import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MyVacationRequestsPage } from './my-vacation-requests-page'

const mocks = vi.hoisted(() => ({
  stateIndex: 0,
  open: false,
  dates: false,
  requests: [] as Array<Record<string, unknown>>,
  setOpen: vi.fn(),
  mutate: vi.fn(),
  invalidate: vi.fn(),
  onOpen: null as null | (() => void),
  dialog: null as null | { open: boolean; isDirty: boolean; onSubmit: () => void },
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = mocks.stateIndex++
      if (index === 0) return [mocks.open, mocks.setOpen]
      if (mocks.dates && index === 2) return ['2026-11-10', vi.fn()]
      if (mocks.dates && index === 3) return ['2026-11-12', vi.fn()]
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
    mocks.dates = false
    mocks.requests = []
    mocks.onOpen = null
    mocks.dialog = null
    vi.clearAllMocks()
  })

  it('muestra el formulario solo después de solicitarlo', () => {
    const html = render()
    expect(html).toContain('Tu tiempo, bien organizado')
    expect(html).toContain('Solicitar ausencia')
    expect(html).toContain('Mis solicitudes')
    expect(html).not.toContain('Hasta, incluido')
    mocks.onOpen?.()
    expect(mocks.setOpen).toHaveBeenCalledWith(true)

    mocks.open = true
    expect(render()).toContain('Hasta, incluido (opcional si no se conoce)')
    expect(render()).toContain('No incluyas información médica privada')
  })

  it('permite enviar un periodo válido desde el diálogo', () => {
    mocks.open = true
    mocks.dates = true
    render()
    expect(mocks.dialog?.isDirty).toBe(true)
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
