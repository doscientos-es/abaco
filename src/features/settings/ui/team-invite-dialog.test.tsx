import type * as ReactQuery from '@tanstack/react-query'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Auth from '@/features/auth'
import type * as StaffSchedules from '@/features/staff-schedules'

import { TeamSection } from './team-section'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

const { state, button, dialog, confirm, field, invite, remove, changeRole, invalidate, query } =
  vi.hoisted(() => ({
    state: vi.fn(),
    button: vi.fn(),
    dialog: vi.fn(),
    confirm: vi.fn(),
    field: vi.fn(),
    invite: vi.fn(),
    remove: vi.fn(),
    changeRole: vi.fn(),
    invalidate: vi.fn(),
    query: vi.fn(),
  }))
const functionsDialog = vi.hoisted(() => vi.fn())

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: state,
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQuery: (options: { queryKey: string[] }) =>
    options.queryKey[0] === 'team' ? query() : { isSuccess: true, data: [] },
  useQueryClient: () => ({ invalidateQueries: invalidate }),
}))
vi.mock('@doscientos/ui', () => ({
  Button: button,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  ConfirmDialog: confirm,
}))
vi.mock('@phosphor-icons/react', () => ({
  TrashIcon: () => null,
  UserPlusIcon: () => null,
  UsersThreeIcon: () => null,
}))
vi.mock('@/features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof Auth>()),
  useSession: () => ({ userId: 'me', role: 'admin' }),
}))
vi.mock('@/features/work-teams', () => ({ WorkTeamsSection: () => null }))
vi.mock('@/features/staff-schedules', async (importOriginal) => ({
  ...(await importOriginal<typeof StaffSchedules>()),
  StaffMemberFunctionsDialog: functionsDialog,
}))
vi.mock('@/shared/ui/field-icons', () => ({ fieldIcons: {} }))
vi.mock('@/shared/ui/form', () => ({ TextField: field, SelectField: field }))
vi.mock('@/shared/ui/form-dialog', () => ({ FormDialog: dialog }))
vi.mock('./team-import-dialog', () => ({ TeamImportDialog: () => null }))
vi.mock('../application/team-actions', () => ({
  teamQuery: () => ({ queryKey: ['team'] }),
  inviteMember: invite,
  changeMemberRole: changeRole,
  removeMember: remove,
}))

describe('team invitation dialog', () => {
  let values: unknown[]
  let cursor: number

  function render(mode: 'manage' | 'invite' = 'invite', personId?: string) {
    cursor = 0
    button.mockClear()
    dialog.mockClear()
    confirm.mockClear()
    field.mockClear()
    return renderToStaticMarkup(<TeamSection tenantId="company" mode={mode} personId={personId} />)
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
    functionsDialog.mockReturnValue(null)
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
    render('manage', 'ana')
    const removeButton = button.mock.calls.find(
      ([props]) => props['aria-label'] === 'Quitar a Ana del equipo',
    )?.[0]
    expect(removeButton).toMatchObject({ variant: 'destructive' })
    expect(remove).not.toHaveBeenCalled()
    removeButton.onPress()
    render('manage', 'ana')
    expect(confirm.mock.calls[0]?.[0].open).toBe(true)
    confirm.mock.calls[0]?.[0].onConfirm()
    await vi.waitFor(() =>
      expect(render('manage', 'ana')).toContain('No se pudo quitar a la persona.'),
    )
    await vi.waitFor(() => {
      render('manage', 'ana')
      expect(confirm.mock.calls[0]?.[0].open).toBe(false)
    })
    expect(remove).toHaveBeenCalledWith('company', 'ana')
  })

  it('updates the selected person role from their profile', async () => {
    query.mockReturnValue({
      isSuccess: true,
      data: [{ userId: 'ana', email: 'ana@example.com', fullName: 'Ana', role: 'user' }],
    })
    changeRole.mockResolvedValue({ ok: true })
    render('manage', 'ana')
    const role = field.mock.calls.find(([props]) => props.label === 'Rol en la empresa')?.[0]
    role.onChange('invalid')
    expect(changeRole).not.toHaveBeenCalled()
    role.onChange('admin')
    await vi.waitFor(() => expect(changeRole).toHaveBeenCalledWith('company', 'ana', 'admin'))
    await vi.waitFor(() => expect(render('manage', 'ana')).toContain('Rol actualizado.'))
    expect(invalidate).toHaveBeenCalled()
  })

  it('opens the functions editor for the selected person', () => {
    query.mockReturnValue({
      isSuccess: true,
      data: [{ userId: 'ana', email: 'ana@example.com', fullName: 'Ana', role: 'user' }],
    })
    render('manage', 'ana')
    const edit = button.mock.calls.find(
      ([props]) => props['aria-label'] === 'Editar funciones de Ana',
    )?.[0]
    edit.onPress()
    render('manage', 'ana')
    expect(functionsDialog.mock.calls[0]?.[0]).toMatchObject({
      tenantId: 'company',
      person: { userId: 'ana', name: 'Ana' },
    })
  })
})
