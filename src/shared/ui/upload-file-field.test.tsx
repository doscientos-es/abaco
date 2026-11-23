import type * as React from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type * as JSXDevRuntime from 'react/jsx-dev-runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { receiptUpload } from '@/shared/domain/upload-file'

import { UploadFileField } from './upload-file-field'

const mocks = vi.hoisted(() => ({
  error: '',
  input: {} as ComponentProps<'input'>,
  remove: () => {},
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: () => [mocks.error, (error: string) => (mocks.error = error)],
}))
vi.mock('react/jsx-dev-runtime', async (original) => {
  const runtime = await original<typeof JSXDevRuntime>()
  return {
    ...runtime,
    jsxDEV: (type: React.ElementType, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (type === 'input' && props.type === 'file') mocks.input = props as ComponentProps<'input'>
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
vi.mock('@doscientos/ui', () => ({
  Button: ({ children, onPress, ...props }: { children: ReactNode; onPress: () => void }) => {
    mocks.remove = onPress
    return <button {...props}>{children}</button>
  },
}))

describe('UploadFileField', () => {
  const onChange = vi.fn()
  const render = (file: File | null = null) =>
    renderToStaticMarkup(
      <UploadFileField
        label="Justificante"
        rules={receiptUpload}
        file={file}
        onChange={onChange}
      />,
    )
  const select = (file: File | undefined) => {
    const target = { files: file ? [file] : [], value: 'chosen' }
    mocks.input.onChange?.({
      currentTarget: target,
    } as unknown as React.ChangeEvent<HTMLInputElement>)
    expect(target.value).toBe('')
  }
  beforeEach(() => {
    mocks.error = ''
    onChange.mockClear()
  })

  it('allows selecting and removing a valid file with a compact labelled action', () => {
    const file = new File(['receipt'], 'una-factura-larga.pdf', { type: 'application/pdf' })
    render()
    select(file)
    expect(onChange).toHaveBeenCalledWith(file)
    const html = render(file)
    expect(html).toContain('Quitar archivo seleccionado: una-factura-larga.pdf')
    expect(html).toContain('min-h-11')
    mocks.remove()
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('clears the previous file when the replacement is invalid, but not when the picker is cancelled', () => {
    const oldFile = new File(['receipt'], 'anterior.pdf', { type: 'application/pdf' })
    render(oldFile)
    select(undefined)
    expect(onChange).not.toHaveBeenCalled()
    select(new File(['bad'], 'archivo.svg', { type: 'image/svg+xml' }))
    expect(onChange).toHaveBeenCalledWith(null)
    const html = render()
    expect(html).toContain('Selecciona un archivo en formato')
    expect(html).toContain('role="alert"')
  })
})
