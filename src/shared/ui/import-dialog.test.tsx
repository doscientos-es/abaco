import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type * as JSXDevRuntime from 'react/jsx-dev-runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImportSchema } from '@/shared/domain/table-import'

import { ImportDialog } from './import-dialog'

const mocks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  version: { current: 0 },
  input: null as React.ComponentProps<'input'> | null,
  buttons: [] as { onPress?: () => void; isDisabled?: boolean }[],
  close: null as ((open: boolean) => void) | null,
  read: vi.fn(),
  info: vi.fn(),
}))

vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useRef: () => mocks.version,
  useState: (initial: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.values)) mocks.values[index] = initial
    return [
      mocks.values[index],
      (value: unknown) => {
        mocks.values[index] = value
      },
    ]
  },
}))
vi.mock('react/jsx-dev-runtime', async (original) => {
  const runtime = await original<typeof JSXDevRuntime>()
  return {
    ...runtime,
    jsxDEV: (type: React.ElementType, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (type === 'input' && props.type === 'file')
        mocks.input = props as React.ComponentProps<'input'>
      return runtime.jsxDEV(
        type,
        props,
        ...(rest as Parameters<typeof runtime.jsxDEV> extends [unknown, unknown, ...infer P]
          ? P
          : never),
      )
    },
  }
})
vi.mock('@doscientos/ui', () => {
  const Wrapper = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    Button: (props: { children?: React.ReactNode; onPress?: () => void; isDisabled?: boolean }) => {
      mocks.buttons.push(props)
      return <button disabled={props.isDisabled}>{props.children}</button>
    },
    DialogRoot: ({
      children,
      onOpenChange,
    }: {
      children: React.ReactNode
      onOpenChange: (open: boolean) => void
    }) => {
      mocks.close = onOpenChange
      return <div>{children}</div>
    },
    DialogClose: Wrapper,
    DialogContent: Wrapper,
    DialogDescription: Wrapper,
    DialogFooter: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
    Spinner: () => <span />,
    toast: { info: mocks.info, success: vi.fn(), error: vi.fn() },
  }
})
vi.mock('@/shared/lib/read-spreadsheet', () => ({ readSpreadsheet: mocks.read }))

const schema: ImportSchema<string> = {
  singular: 'cliente',
  plural: 'clientes',
  columns: [{ label: 'Nombre', required: true, hint: '', example: 'Ana' }],
  parse: (row) => ({ ok: true, value: row.Nombre ?? '' }),
  duplicateKeys: (name) => [name],
}
const onImport = vi.fn()
const onClose = vi.fn()
function render() {
  mocks.cursor = 0
  mocks.buttons = []
  return renderToStaticMarkup(
    <ImportDialog
      open
      onClose={onClose}
      schema={schema}
      existingKeys={new Set()}
      onImport={onImport}
    />,
  )
}
function choose(name: string) {
  mocks.input?.onChange?.({
    target: { files: [{ name }], value: name },
  } as unknown as React.ChangeEvent<HTMLInputElement>)
}
function deferred() {
  let resolve: (rows: string[][]) => void = () => {}
  const promise = new Promise<string[][]>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.values = []
  mocks.version.current = 0
  mocks.input = null
  mocks.close = null
})

describe('import feedback', () => {
  it('clears the old preview, disables import and ignores an older read finishing late', async () => {
    const first = deferred()
    const second = deferred()
    mocks.read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render()
    choose('primero.csv')
    expect(render()).toContain('Leyendo primero.csv')
    choose('segundo.csv')
    second.resolve([['Nombre'], ['Bea']])
    await vi.waitFor(() => expect(render()).toContain('1 registro listo para importar'))
    first.resolve([['Nombre'], ['Ana'], ['Luis']])
    await first.promise
    await Promise.resolve()
    expect(render()).toContain('1 registro listo para importar')
    mocks.buttons.at(-1)?.onPress?.()
    expect(onImport).toHaveBeenCalledWith(['Bea'])
    expect(mocks.info).toHaveBeenCalledWith('1 registro añadido a la lista', expect.anything())
  })

  it('invalidates a read on close so it cannot appear on reopening', async () => {
    const read = deferred()
    mocks.read.mockReturnValue(read.promise)
    render()
    choose('archivo.csv')
    render()
    expect(mocks.buttons.at(-1)?.isDisabled).toBe(true)
    mocks.close?.(false)
    read.resolve([['Nombre'], ['Ana']])
    await read.promise
    await Promise.resolve()
    expect(render()).not.toContain('listo para importar')
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the dialog open and shows an error if import cannot start', async () => {
    mocks.read.mockResolvedValue([['Nombre'], ['Ana']])
    render()
    choose('archivo.csv')
    await vi.waitFor(() => expect(render()).toContain('1 registro listo para importar'))
    onImport.mockImplementationOnce(() => {
      throw new Error('No hay tipo de cliente.')
    })
    mocks.buttons.at(-1)?.onPress?.()
    expect(render()).toContain('No hay tipo de cliente.')
    expect(onClose).not.toHaveBeenCalled()
    expect(mocks.info).not.toHaveBeenCalled()
  })
})
