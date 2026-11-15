import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type * as ReactJsxDevRuntime from 'react/jsx-dev-runtime'
import type * as ReactJsxRuntime from 'react/jsx-runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkerDocuments } from './worker-documents'

type Action = { onPress: () => void; isDisabled: boolean }
type Events = {
  onChange?: (event: unknown) => void
  onDrop?: (event: unknown) => void
}
const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  actions: new Map<string, Action>(),
  events: new Map<string, Events>(),
  upload: vi.fn(),
  invalidate: vi.fn(),
  query: {} as Record<string, unknown>,
}))

// Preserve state between static renders and capture DOM events without a browser dependency.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return {
    ...actual,
    useRef: (initial: unknown) => {
      const index = mocks.cursor++
      if (!(index in mocks.states)) mocks.states[index] = { current: initial }
      return mocks.states[index]
    },
    useState: (initial: unknown) => {
      const index = mocks.cursor++
      if (!(index in mocks.states)) mocks.states[index] = initial
      return [
        mocks.states[index],
        (value: unknown) => {
          mocks.states[index] = value
        },
      ]
    },
  }
})
vi.mock('react/jsx-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactJsxRuntime>()
  function capture(type: unknown, props: Record<string, unknown>, key?: React.Key) {
    if (type === 'div' && props['data-testid'] === 'document-dropzone')
      mocks.events.set('dropzone', props as Events)
    if (type === 'input' && props.type === 'file') mocks.events.set('file', props as Events)
    if (type === 'select' && props['aria-label'] === 'Filtrar por tipo de archivo')
      mocks.events.set('filter', props as Events)
    return actual.jsx(type as never, props, key)
  }
  return { ...actual, jsx: capture, jsxs: capture }
})
vi.mock('react/jsx-dev-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactJsxDevRuntime>()
  return {
    ...actual,
    jsxDEV: (type: unknown, props: Record<string, unknown>, ...args: unknown[]) => {
      if (type === 'div' && props['data-testid'] === 'document-dropzone')
        mocks.events.set('dropzone', props as Events)
      if (type === 'input' && props.type === 'file') mocks.events.set('file', props as Events)
      if (type === 'select' && props['aria-label'] === 'Filtrar por tipo de archivo')
        mocks.events.set('filter', props as Events)
      return actual.jsxDEV(
        type as never,
        props,
        ...(args as Parameters<typeof actual.jsxDEV> extends [unknown, unknown, ...infer Rest]
          ? Rest
          : never),
      )
    },
  }
})
vi.mock('@doscientos/ui', () => ({
  Button: ({
    children,
    onPress,
    isDisabled = false,
    ...props
  }: {
    children: ReactNode
    onPress: () => void
    isDisabled?: boolean
    'aria-label'?: string
  }) => {
    const label = props['aria-label'] ?? (typeof children === 'string' ? children : '')
    if (label) mocks.actions.set(label, { onPress, isDisabled })
    return (
      <button disabled={isDisabled} aria-label={props['aria-label']}>
        {children}
      </button>
    )
  },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => mocks.query,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}))
vi.mock('../application/worker-document-actions', () => ({
  listWorkerDocuments: vi.fn(),
  uploadWorkerDocument: mocks.upload,
  downloadWorkerDocument: vi.fn(),
}))

function render() {
  mocks.cursor = 0
  mocks.actions.clear()
  mocks.events.clear()
  return renderToStaticMarkup(<WorkerDocuments tenantId="tenant" workerId="worker" />)
}

function drop(...files: File[]) {
  const preventDefault = vi.fn()
  mocks.events.get('dropzone')?.onDrop?.({ preventDefault, dataTransfer: { files } })
  expect(preventDefault).toHaveBeenCalledOnce()
  return render()
}

describe('worker documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.states = []
    mocks.query = {
      isSuccess: true,
      data: [
        { id: '1', name: 'Contrato.PDF', created_at: '2026-01-01T00:00:00Z' },
        { id: '2', name: 'Foto.jpg', created_at: '2026-01-02T00:00:00Z' },
        { id: '3', name: 'Sin extensión', created_at: '2026-01-03T00:00:00Z' },
      ],
    }
    mocks.upload.mockResolvedValue(undefined)
    mocks.invalidate.mockResolvedValue(undefined)
  })

  it('filters saved files by extension and keeps downloads available', () => {
    expect(render()).toContain('Sin extensión')
    mocks.events.get('filter')?.onChange?.({ target: { value: 'image' } })
    const html = render()
    expect(html).toContain('Foto.jpg')
    expect(html).not.toContain('Contrato.PDF')
    expect(html).not.toContain('Sin extensión')
    expect(mocks.actions.has('Descargar Foto.jpg')).toBe(true)
    mocks.events.get('filter')?.onChange?.({ target: { value: 'other' } })
    expect(render()).toContain('Sin extensión')
  })

  it('accepts a dropped document and saves it for the selected worker', async () => {
    render()
    const file = new File(['pdf'], 'contrato.pdf', { type: 'application/pdf' })
    expect(drop(file)).toContain('Listo para guardar')
    mocks.actions.get('Guardar documento')?.onPress()
    await vi.waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce())
    expect(mocks.upload).toHaveBeenCalledWith({
      tenantId: 'tenant',
      workerId: 'worker',
      file,
      id: expect.any(String),
    })
    expect(render()).not.toContain('Listo para guardar')
  })

  it('rejects unsupported or multiple dropped files without retaining an old selection', () => {
    render()
    const file = new File(['pdf'], 'contrato.pdf', { type: 'application/pdf' })
    drop(file)
    expect(drop(file, file)).toContain('Selecciona un documento cada vez.')
    expect(mocks.actions.has('Guardar documento')).toBe(false)
    expect(drop(new File(['x'], 'nota.txt', { type: 'text/plain' }))).toContain('Usa un PDF')
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('supports file selection and retries failed uploads with the same id', async () => {
    mocks.upload.mockRejectedValueOnce(new Error('Sin conexión'))
    render()
    const file = new File(['png'], 'imagen.png', { type: 'image/png' })
    mocks.events.get('file')?.onChange?.({ target: { files: [file] } })
    render()
    mocks.actions.get('Guardar documento')?.onPress()
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(render()).toContain('Sin conexión'))
    mocks.actions.get('Guardar documento')?.onPress()
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2))
    expect(mocks.upload.mock.calls[0]?.[0].id).toBe(mocks.upload.mock.calls[1]?.[0].id)
  })
})
