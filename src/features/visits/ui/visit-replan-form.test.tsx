import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { VisitSummary } from '../application/visit-actions'
import { VisitReplanForm } from './visit-replan-form'

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  done: vi.fn(),
  error: vi.fn(),
  buttons: new Map<string, () => void>(),
  fields: new Map<string, string>(),
  reason: 'Cambio solicitado',
  index: 0,
}))
vi.mock('react', async (load) => {
  const actual = await load<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const state = actual.useState(initial)
      return mocks.index++ === 3 ? [mocks.reason, state[1]] : state
    },
  }
})
vi.mock('@doscientos/ui', () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => {
    if (typeof children === 'string') mocks.buttons.set(children, onPress)
    return <button>{children}</button>
  },
  toast: { success: vi.fn(), error: mocks.error },
}))
vi.mock('@/shared/ui/form', () => {
  const Field = ({ label, value }: { label: string; value: string }) => {
    mocks.fields.set(label, value)
    return <span>{value}</span>
  }
  return { SelectField: Field, TextField: Field }
})
vi.mock('../application/visit-actions', () => ({ replanServiceVisit: mocks.save }))
const visit: VisitSummary = {
  id: 'visit',
  title: 'TEST',
  client_name: '',
  location_name: '',
  address: '',
  timezone: 'Europe/Madrid',
  assigned_user_id: 'ana',
  scheduled_start_at: '2026-11-13T08:00:00Z',
  scheduled_end_at: '2026-11-13T09:00:00Z',
  status: 'scheduled',
  priority: 'normal',
  notes: '',
  updated_at: 'original-version',
}
function render(durationMinutes = 90) {
  mocks.index = 0
  return renderToStaticMarkup(
    <VisitReplanForm
      tenantId="tenant"
      visit={visit}
      technicians={[]}
      onDone={mocks.done}
      onCancel={vi.fn()}
      proposal={{ localStart: '2026-11-14T11:00', durationMinutes }}
    />,
  )
}
describe('calendar replan confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reason = 'Cambio solicitado'
    mocks.buttons.clear()
    mocks.fields.clear()
    mocks.save.mockResolvedValue(undefined)
    mocks.done.mockResolvedValue(undefined)
  })
  it('prefills the proposed time and duration, requires confirmation, and retains the concurrency version and assignee', async () => {
    expect(render()).toContain('Todavía no se ha modificado')
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.fields.get('Nuevo inicio local')).toBe('2026-11-14T11:00')
    expect(mocks.fields.get('Duración en minutos')).toBe('90')
    mocks.buttons.get('Guardar cambio')?.()
    await vi.waitFor(() => expect(mocks.done).toHaveBeenCalledOnce())
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedUpdatedAt: 'original-version',
        visitId: 'visit',
        assignedUserId: 'ana',
        localStart: '2026-11-14T11:00',
        durationMinutes: 90,
        reason: 'Cambio solicitado',
        operationId: expect.any(String),
      }),
    )
  })
  it('blocks missing reasons and durations beyond the backend limit', () => {
    mocks.reason = ''
    render()
    mocks.buttons.get('Guardar cambio')?.()
    mocks.reason = 'Motivo'
    render(735)
    mocks.buttons.get('Guardar cambio')?.()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('retains the operation id on failure and leaves confirmation open for retry', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Concurrent update'))
    render()
    mocks.buttons.get('Guardar cambio')?.()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(mocks.done).not.toHaveBeenCalled()
    mocks.buttons.get('Guardar cambio')?.()
    await vi.waitFor(() => expect(mocks.done).toHaveBeenCalledOnce())
    expect(mocks.save.mock.calls[0]?.[0].operationId).toBe(
      mocks.save.mock.calls[1]?.[0].operationId,
    )
  })
})
