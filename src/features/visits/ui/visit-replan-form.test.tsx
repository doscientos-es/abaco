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
  duration: undefined as string | undefined,
  start: undefined as string | undefined,
  index: 0,
}))
vi.mock('react', async (load) => {
  const actual = await load<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const state = actual.useState(initial)
      const index = mocks.index++
      if (index === 0 && mocks.start !== undefined) return [mocks.start, state[1]]
      if (index === 1 && mocks.duration !== undefined) return [mocks.duration, state[1]]
      return index === 3 ? [mocks.reason, state[1]] : state
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
function render(currentVisit = visit) {
  mocks.index = 0
  return renderToStaticMarkup(
    <VisitReplanForm
      tenantId="tenant"
      visit={currentVisit}
      technicians={[]}
      onDone={mocks.done}
      onCancel={vi.fn()}
    />,
  )
}
describe('manual visit replanning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reason = 'Cambio solicitado'
    mocks.duration = undefined
    mocks.start = undefined
    mocks.buttons.clear()
    mocks.fields.clear()
    mocks.save.mockResolvedValue(undefined)
    mocks.done.mockResolvedValue(undefined)
  })
  it('prefills the current local time and duration, then saves with the version and assignee', async () => {
    render()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.fields.get('Nuevo inicio local')).toBe('2026-11-13T09:00')
    expect(mocks.fields.get('Duración en minutos')).toBe('60')
    mocks.buttons.get('Guardar cambio')?.()
    await vi.waitFor(() => expect(mocks.done).toHaveBeenCalledOnce())
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedUpdatedAt: 'original-version',
        visitId: 'visit',
        assignedUserId: 'ana',
        localStart: '2026-11-13T09:00',
        durationMinutes: 60,
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
    mocks.duration = '735'
    render()
    mocks.buttons.get('Guardar cambio')?.()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('retains a team assignment when replanning without selecting a technician', async () => {
    const html = render({ ...visit, assigned_user_id: null, work_team_id: 'team' })
    expect(html).toContain('Si seleccionas un técnico, sustituirá al equipo asignado')
    mocks.buttons.get('Guardar cambio')?.()
    await vi.waitFor(() => expect(mocks.done).toHaveBeenCalledOnce())
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ assignedUserId: null }))
  })
  it('previews the actual new time separately from the original slot and saves only the selected visit', async () => {
    mocks.start = '2026-11-14T11:45'
    mocks.duration = '45'
    const html = render({
      ...visit,
      contract_occurrence_on: '2026-11-12',
      contract_title: 'Mantenimiento semanal',
    })
    expect(html).toContain('solo esta visita')
    expect(html).toContain('12 nov 2026')
    expect(html).toContain('13 nov 2026')
    expect(html).toContain('14 nov 2026')
    expect(html).toContain('11:45')
    expect(html).toContain('45')
    expect(html).toContain('Las demás visitas de la serie no cambian.')
    const submit = mocks.buttons.get('Mover solo esta visita')
    submit?.()
    submit?.()
    await vi.waitFor(() => expect(mocks.done).toHaveBeenCalledOnce())
    expect(mocks.save).toHaveBeenCalledOnce()
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ visitId: 'visit', localStart: mocks.start, durationMinutes: 45 }),
    )
  })

  it('does not preview or submit an impossible date', () => {
    mocks.start = '2026-02-31T11:45'
    expect(render({ ...visit, contract_occurrence_on: '2026-11-12' })).not.toContain(
      'Nuevo inicio:',
    )
    mocks.buttons.get('Mover solo esta visita')?.()
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
