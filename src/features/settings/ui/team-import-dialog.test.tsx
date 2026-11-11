import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TeamImportDialog } from './team-import-dialog'

const { state, dialog, readSpreadsheet, invite } = vi.hoisted(() => ({
  state: vi.fn(),
  dialog: vi.fn(),
  readSpreadsheet: vi.fn(),
  invite: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: state,
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/shared/ui/form-dialog', () => ({ FormDialog: dialog }))
vi.mock('@/shared/lib/read-spreadsheet', () => ({ readSpreadsheet }))
vi.mock('../application/team-actions', () => ({ inviteMember: invite }))

describe('team import dialog', () => {
  let values: unknown[]
  let cursor: number
  const onClose = vi.fn()
  const onResult = vi.fn()

  function render() {
    cursor = 0
    dialog.mockClear()
    return renderToStaticMarkup(
      <TeamImportDialog
        open
        tenantId="company"
        existingEmails={['existing@example.com']}
        onClose={onClose}
        onResult={onResult}
      />,
    )
  }

  function props() {
    const result = dialog.mock.calls[0]?.[0]
    if (!result) throw new Error('Dialog was not rendered')
    return result
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
    dialog.mockImplementation(({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ))
    onResult.mockResolvedValue(undefined)
  })

  it('previews valid rows and stops when an invitation fails', async () => {
    readSpreadsheet.mockResolvedValue([
      ['Correo', 'Nombre', 'Rol'],
      ['existing@example.com', 'Existing', 'Usuario'],
      ['ana@example.com', 'Ana', 'Administrador'],
      ['bad', '', ''],
      ['luis@example.com', 'Luis', 'Usuario'],
    ])
    invite
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, message: 'Límite alcanzado.' })

    render()
    expect(props().submitDisabled).toBe(true)
    props().children.props.children[0].props.onChange({ target: { files: [{}], value: 'file' } })
    expect(render()).toContain('Cargando archivo')
    expect(props().isSubmitting).toBe(true)
    await vi.waitFor(() => expect(render()).toContain('ana@example.com'))
    expect(render()).toContain('1 duplicadas')
    expect(render()).toContain('Fila 4: Correo no válido.')
    expect(props().submitLabel).toBe('Enviar 2 invitaciones')
    props().onSubmit()
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledOnce())
    expect(invite).toHaveBeenCalledTimes(2)
    expect(invite).toHaveBeenNthCalledWith(1, {
      tenantId: 'company',
      email: 'ana@example.com',
      fullName: 'Ana',
      role: 'admin',
    })
    expect(onResult.mock.calls[0]?.[0]).toContain(
      'Se detuvo en luis@example.com: Límite alcanzado.',
    )
    expect(onClose).toHaveBeenCalledOnce()
  })
})
