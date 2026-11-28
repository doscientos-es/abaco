import { Children, isValidElement, type ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TeamImportDialog } from './team-import-dialog'

const { state, dialog, readWorkbook, invite } = vi.hoisted(() => ({
  state: vi.fn(),
  dialog: vi.fn(),
  readWorkbook: vi.fn(),
  invite: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: state,
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}))
vi.mock('@/features/auth', () => ({ roleLabels: { admin: 'Administrador', user: 'Usuario' } }))
vi.mock('@/shared/ui/form-dialog', () => ({ FormDialog: dialog }))
vi.mock('@/shared/lib/read-spreadsheet', () => ({ readSpreadsheetSheets: readWorkbook }))
vi.mock('../application/team-actions', () => ({ inviteMember: invite }))

type Control = {
  children?: ReactNode
  type?: string
  onChange?: (event: { target: Record<string, unknown> }) => void
}

function controls(node: ReactNode, type: string): Control[] {
  return Children.toArray(node).flatMap((part) => {
    if (!isValidElement<Control>(part)) return []
    return [
      ...(part.type === 'input' && part.props.type === type ? [part.props] : []),
      ...controls(part.props.children, type),
    ]
  })
}

describe('team import dialog', () => {
  let values: unknown[]
  let cursor: number
  let emails: string[]
  const verify = vi.fn<() => Promise<string[]>>()
  const onClose = vi.fn()
  const onResult = vi.fn()

  function render() {
    cursor = 0
    dialog.mockClear()
    return renderToStaticMarkup(
      <TeamImportDialog
        open
        tenantId="company"
        existingEmails={emails}
        verifyExistingEmails={verify}
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

  async function selectWorkbook() {
    render()
    expect(props().submitDisabled).toBe(true)
    controls(props().children, 'file')[0]?.onChange?.({ target: { files: [{}], value: 'file' } })
    expect(render()).toContain('Cargando archivo')
    await vi.waitFor(() => expect(render()).toContain('Asignar columnas'))
    expect(invite).not.toHaveBeenCalled()
  }

  beforeEach(() => {
    vi.resetAllMocks()
    values = []
    cursor = 0
    emails = ['existing@example.test']
    state.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in values)) values[index] = initial
      return [
        values[index],
        (value: unknown) => {
          values[index] = typeof value === 'function' ? value(values[index]) : value
        },
      ]
    })
    dialog.mockImplementation(({ children }: { children: ReactNode }) => <div>{children}</div>)
    verify.mockResolvedValue([])
    onResult.mockResolvedValue(undefined)
    readWorkbook.mockResolvedValue([
      {
        name: 'Hoja ficticia',
        rows: [
          ['Correo', 'Nombre', 'Rol', 'DNI'],
          ['existing@example.test', 'Existing', 'Usuario', 'secret-dni-1'],
          ['ana@example.test', 'Ana', 'Administrador', 'secret-dni-2'],
          ['bad', '', '', 'secret-dni-3'],
          ['luis@example.test', 'Luis', 'Usuario', 'secret-dni-4'],
          ['nora@example.test', 'Nora', 'Usuario', 'secret-dni-5'],
        ],
      },
    ])
  })

  it('requires review and explicit admin confirmation; reports actual partial outcomes and drops private data', async () => {
    invite
      .mockResolvedValueOnce({ ok: true, status: 'invited' })
      .mockResolvedValueOnce({ ok: false, message: 'Límite alcanzado.' })
    await selectWorkbook()
    props().onSubmit()
    expect(render()).toContain('ana@example.test')
    expect(render()).toContain('1 duplicadas')
    expect(render()).toContain('Correo no válido.')
    expect(render()).not.toContain('secret-dni')
    expect(verify).not.toHaveBeenCalled()
    props().onSubmit()
    expect(invite).not.toHaveBeenCalled()

    controls(props().children, 'checkbox')[0]?.onChange?.({ target: { checked: true } })
    render()
    props().onSubmit()
    expect(invite).not.toHaveBeenCalled()
    controls(props().children, 'checkbox')[1]?.onChange?.({ target: { checked: true } })
    // A background team change cannot turn an earlier duplicate into an approved invitation.
    emails = []
    render()
    props().onSubmit()
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledOnce())
    expect(invite).toHaveBeenCalledTimes(2)
    expect(invite).toHaveBeenNthCalledWith(1, {
      tenantId: 'company',
      email: 'ana@example.test',
      fullName: 'Ana',
      role: 'admin',
    })
    expect(render()).toContain('Invitaciones enviadas: 1.')
    expect(render()).toContain('Resultado no confirmado')
    expect(render()).toContain('Sin intentar')
    expect(render()).not.toContain('ana@example.test')
    expect(onClose).not.toHaveBeenCalled()
    props().onSubmit()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not send anything if the fresh team check fails', async () => {
    verify.mockRejectedValue(new Error('network'))
    await selectWorkbook()
    props().onSubmit()
    render()
    for (const input of controls(props().children, 'checkbox'))
      input.onChange?.({ target: { checked: true } })
    render()
    props().onSubmit()
    await vi.waitFor(() => expect(render()).toContain('No se ha iniciado ningún envío.'))
    expect(invite).not.toHaveBeenCalled()
  })
})
