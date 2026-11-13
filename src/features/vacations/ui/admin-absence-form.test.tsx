import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { VacationRequest } from '../domain/vacation-request'
import { AdminAbsenceForm } from './admin-absence-form'

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  invalidate: vi.fn(),
  done: vi.fn(),
  error: vi.fn(),
  submit: undefined as undefined | (() => void),
  decisionOverride: undefined as string | undefined,
  fields: new Map<string, string>(),
}))
vi.mock('react', async (load) => {
  const actual = await load<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) =>
      actual.useState(
        mocks.decisionOverride !== undefined &&
          typeof initial === 'object' &&
          initial !== null &&
          'requester_id' in initial
          ? { ...initial, decision_comment: mocks.decisionOverride }
          : initial,
      ),
  }
})
vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  toast: { success: vi.fn(), error: mocks.error },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: () => ({ data: [{ userId: 'ana', fullName: 'Ana', email: 'ana@example.com' }] }),
}))
vi.mock('../application/vacation-actions', () => ({
  saveAdministrativeAbsence: mocks.save,
  listAbsenceHistory: vi.fn(),
}))
vi.mock('@/features/settings/application/team-actions', () => ({
  teamQuery: () => ({ queryKey: ['team', 'tenant'] }),
}))
vi.mock('@/shared/ui/form', () => ({
  SelectField: ({ label }: { label: string }) => <span>{label}</span>,
  TextField: ({ label, value }: { label: string; value: string }) => {
    mocks.fields.set(label, value)
    return null
  },
  TextareaField: () => null,
}))
vi.mock('@/shared/ui/form-dialog', () => ({
  FormDialog: ({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) => {
    mocks.submit = onSubmit
    return <div>{children}</div>
  },
}))

const request: VacationRequest = {
  id: 'request-1',
  requesterId: 'ana',
  requesterName: 'Ana',
  absenceType: 'vacation',
  startDate: '2026-11-10',
  endDate: null,
  status: 'needs_info',
  comment: 'Fechas por confirmar',
  submittedAt: '2026-11-09T09:00:00Z',
  decisionComment: '',
  decidedAt: null,
  decidedByName: '',
  informationRequestComment: '¿Hasta cuándo?',
  requesterResponseComment: '',
  updatedAt: '2026-11-10T09:00:00Z',
}

describe('administrative absence persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.save.mockResolvedValue(undefined)
    mocks.invalidate.mockResolvedValue(undefined)
    mocks.decisionOverride = undefined
    mocks.fields.clear()
  })

  it('preserves needs_info, normalizes an open end date and refreshes affected queries', async () => {
    const html = renderToStaticMarkup(
      <AdminAbsenceForm
        tenantId="tenant"
        request={request}
        requests={[request]}
        onDone={mocks.done}
      />,
    )
    expect(html).toContain('Empleado: Ana')
    expect(html).not.toContain('Empleado · obligatorio')
    mocks.submit?.()
    await vi.waitFor(() => expect(mocks.done).toHaveBeenCalledOnce())
    expect(mocks.save).toHaveBeenCalledWith(
      'tenant',
      request,
      expect.objectContaining({ status: 'needs_info', end_date: null }),
      expect.any(String),
    )
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['vacation-coverage', 'tenant'] })
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['absence-history', 'tenant'] })
  })

  it('keeps the form open after a failed write and reuses its operation key on retry', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Sin conexión'))
    renderToStaticMarkup(
      <AdminAbsenceForm tenantId="tenant" request={request} requests={[]} onDone={mocks.done} />,
    )
    mocks.submit?.()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalled())
    expect(mocks.done).not.toHaveBeenCalled()
    const firstOperation = mocks.save.mock.calls[0]?.[3]
    mocks.submit?.()
    await vi.waitFor(() => expect(mocks.done).toHaveBeenCalledOnce())
    expect(mocks.save.mock.calls[1]?.[3]).toBe(firstOperation)
  })

  it('does not call persistence for an invalid date range even on direct submission', () => {
    renderToStaticMarkup(
      <AdminAbsenceForm
        tenantId="tenant"
        request={{ ...request, endDate: '2026-11-01' }}
        requests={[]}
        onDone={mocks.done}
      />,
    )
    mocks.submit?.()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('rejects submissions for someone outside the current team context', () => {
    renderToStaticMarkup(
      <AdminAbsenceForm
        tenantId="tenant"
        request={request}
        requests={[]}
        memberIds={['bea']}
        onDone={mocks.done}
      />,
    )
    mocks.submit?.()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('prefills a calendar proposal but requires a new change reason before saving', async () => {
    const props = {
      tenantId: 'tenant',
      request,
      requests: [request],
      onDone: mocks.done,
      proposal: { startDate: '2026-11-20', endDate: null },
    }
    renderToStaticMarkup(<AdminAbsenceForm {...props} />)
    expect(mocks.fields.get('Inicio · obligatorio')).toBe('2026-11-20')
    expect(mocks.fields.get('Fin inclusivo')).toBe('')
    mocks.submit?.()
    expect(mocks.save).not.toHaveBeenCalled()
    mocks.decisionOverride = 'Cambio de fechas acordado'
    renderToStaticMarkup(<AdminAbsenceForm {...props} />)
    mocks.submit?.()
    await vi.waitFor(() => expect(mocks.done).toHaveBeenCalledOnce())
    expect(mocks.save).toHaveBeenCalledWith(
      'tenant',
      request,
      expect.objectContaining({
        start_date: '2026-11-20',
        end_date: null,
        status: 'needs_info',
        decision_comment: 'Cambio de fechas acordado',
      }),
      expect.any(String),
    )
    expect(request.updatedAt).toBe('2026-11-10T09:00:00Z')
  })
})
