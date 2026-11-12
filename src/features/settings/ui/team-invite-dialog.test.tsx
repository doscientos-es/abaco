import type * as ReactQuery from '@tanstack/react-query'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Auth from '@/features/auth'

import { TeamSection } from './team-section'

const { state, button, dialog, confirm, field, invite, remove, invalidate, query } = vi.hoisted(
  () => ({
    state: vi.fn(),
    button: vi.fn(),
    dialog: vi.fn(),
    confirm: vi.fn(),
    field: vi.fn(),
    invite: vi.fn(),
    remove: vi.fn(),
    invalidate: vi.fn(),
    query: vi.fn(),
  }),
)

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: state,
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQuery: query,
  useQueryClient: () => ({ invalidateQueries: invalidate }),
}))
vi.mock('@doscientos/ui', () => ({
  Button: button,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  ConfirmDialog: confirm,
}))
vi.mock('@phosphor-icons/react', () => ({ UserPlusIcon: () => null, UsersThreeIcon: () => null }))
vi.mock('@/features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof Auth>()),
  useSession: () => ({ userId: 'me', role: 'admin' }),
}))
vi.mock('@/features/work-teams', () => ({ WorkTeamsSection: () => null }))
vi.mock('@/shared/ui/field-icons', () => ({ fieldIcons: {} }))
vi.mock('@/shared/ui/form', () => ({ TextField: field, SelectField: field }))
vi.mock('@/shared/ui/form-dialog', () => ({ FormDialog: dialog }))
vi.mock('./team-import-dialog', () => ({ TeamImportDialog: () => null }))
vi.mock('../application/team-actions', () => ({
  teamQuery: () => ({ queryKey: ['team'] }),
  inviteMember: invite,
  changeMemberRole: vi.fn(),
  removeMember: remove,
}))

describe('team invitation dialog', () => {
  let values: unknown[]
  let cursor: number

  function render() {
    cursor = 0
    button.mockClear()
    dialog.mockClear()
    confirm.mockClear()
    field.mockClear()
    return renderToStaticMarkup(<TeamSection tenantId="company" />)
  }

  function dialogProps() {
    const props = dialog.mock.calls[0]?.[0]
    if (!props) throw new Error('Dialog was not rendered')
    return props
  }

  beforeEach(() => {
    vi.resetAllMocks()
    values = []
    cursor = 0
    state.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in values)) values[index] = initial
      return [
        values[index],
        (value: unknown) => {
          values[index] = value
        },
      ]
    })
    button.mockImplementation(({ children }: { children: React.ReactNode }) => (
      <button>{children}</button>
    ))
    dialog.mockImplementation(({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div>{children}</div> : null,
    )
    confirm.mockReturnValue(null)
    field.mockImplementation(({ label }: { label: string }) => <span>{label}</span>)
    invalidate.mockResolvedValue(undefined)
    query.mockReturnValue({ isSuccess: true, data: [] })
  })

  it('opens from the CTA and validates before sending', () => {
    render()
    expect(dialogProps().open).toBe(false)
    button.mock.calls.find(([props]) => props['aria-haspopup'] === 'dialog')?.[0].onPress()
    const html = render()
    expect(dialogProps().open).toBe(true)
    expect(dialogProps().submitDisabled).toBe(true)
    expect(html).toContain('Nombre (opcional)')
    field.mock.calls.find(([props]) => props.label === 'Correo')?.[0].onChange('ana@example.com')
    render()
    expect(dialogProps().submitDisabled).toBe(false)
    expect(dialogProps().isDirty).toBe(true)
  })

  it('keeps errors in the dialog and closes with a visible message after success', async () => {
    values = ['ana@example.com', 'Ana', 'user', null, false, true]
    invite.mockResolvedValueOnce({ ok: false, message: 'No se pudo invitar.' })
    render()
    dialogProps().onSubmit()
    await vi.waitFor(() => expect(invite).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(render()).toContain('No se pudo invitar.'))
    expect(dialogProps().open).toBe(true)

    invite.mockResolvedValueOnce({ ok: true, status: 'invited' })
    dialogProps().onSubmit()
    await vi.waitFor(() => expect(render()).toContain('Invitación enviada por correo.'))
    expect(dialogProps().open).toBe(false)
    expect(invite).toHaveBeenLastCalledWith({
      tenantId: 'company',
      email: 'ana@example.com',
      fullName: 'Ana',
      role: 'user',
    })
  })

  it('closes the removal confirmation and shows the error when removal fails', async () => {
    query.mockReturnValue({
      isSuccess: true,
      data: [{ userId: 'ana', email: 'ana@example.com', fullName: 'Ana', role: 'user' }],
    })
    remove.mockResolvedValue({ ok: false, message: 'No se pudo quitar a la persona.' })
    render()
    button.mock.calls
      .find(([props]) => props['aria-label'] === 'Quitar a Ana del equipo')?.[0]
      .onPress()
    render()
    expect(confirm.mock.calls[0]?.[0].open).toBe(true)
    confirm.mock.calls[0]?.[0].onConfirm()
    await vi.waitFor(() => expect(render()).toContain('No se pudo quitar a la persona.'))
    await vi.waitFor(() => {
      render()
      expect(confirm.mock.calls[0]?.[0].open).toBe(false)
    })
    expect(remove).toHaveBeenCalledWith('company', 'ana')
  })
})
