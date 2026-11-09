import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MyVacationRequestsPage } from './my-vacation-requests-page'

const mocks = vi.hoisted(() => ({
  stateIndex: 0,
  open: false,
  dates: false,
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
      if (mocks.dates && index === 1) return ['2026-11-10', vi.fn()]
      if (mocks.dates && index === 2) return ['2026-11-12', vi.fn()]
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
  useQuery: () => ({ data: [] }),
  useMutation: () => ({ isPending: false, mutate: mocks.mutate }),
}))
vi.mock('@/features/auth', () => ({ useSession: () => ({ tenantId: 'tenant-1' }) }))
vi.mock('../application/vacation-actions', () => ({
  listVacationRequests: vi.fn(),
  submitVacationRequest: vi.fn(),
}))
vi.mock('./vacation-decision-notices', () => ({ VacationDecisionNotices: () => null }))
vi.mock('./vacation-request-card', () => ({ VacationRequestCard: () => null }))
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
    mocks.onOpen = null
    mocks.dialog = null
    vi.clearAllMocks()
  })

  it('muestra el formulario solo después de solicitarlo', () => {
    const html = render()
    expect(html).toContain('Solicitar vacaciones')
    expect(html).toContain('Historial de solicitudes')
    expect(html).not.toContain('Hasta, incluido')
    mocks.onOpen?.()
    expect(mocks.setOpen).toHaveBeenCalledWith(true)

    mocks.open = true
    expect(render()).toContain('Hasta, incluido')
  })

  it('permite enviar un periodo válido desde el diálogo', () => {
    mocks.open = true
    mocks.dates = true
    render()
    expect(mocks.dialog?.isDirty).toBe(true)
    mocks.dialog?.onSubmit()
    expect(mocks.mutate).toHaveBeenCalledOnce()
  })
})
