import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  fields: new Map<string, (value: string) => void>(),
  submit: null as null | (() => void),
  blocker: null as null | { shouldBlockFn: () => boolean; enableBeforeUnload: () => boolean },
  create: vi.fn(),
  update: vi.fn(),
  close: vi.fn(),
  saved: vi.fn(),
  types: [
    { id: '1', value: 'person', label: 'Particular', position: 1 },
    { id: '2', value: 'hotel', label: 'Hotel', position: 2 },
  ],
  options: new Map<string, Array<{ value: string; label: string }>>(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useRef: (initial: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states)) mocks.states[index] = { current: initial }
    return mocks.states[index]
  },
  useState: (initial: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states))
      mocks.states[index] = typeof initial === 'function' ? initial() : initial
    return [
      mocks.states[index],
      (value: unknown) => {
        mocks.states[index] = typeof value === 'function' ? value(mocks.states[index]) : value
      },
    ]
  },
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/clientes">{children}</a>,
  useBlocker: (options: typeof mocks.blocker) => {
    mocks.blocker = options
  },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ isSuccess: true, data: mocks.types }),
}))
vi.mock('../application/client-types', () => ({
  clientTypesQuery: (id: string) => ({ queryKey: ['client-types', id] }),
}))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({ clients: [], tenant: { id: 'tenant' } }),
}))
vi.mock('@/shared/ui/form', () => {
  const Field = ({
    label,
    onChange,
    options,
  }: {
    label: string
    onChange: (value: string) => void
    options?: Array<{ value: string; label: string }>
  }) => {
    mocks.fields.set(label, onChange)
    if (options) mocks.options.set(label, options)
    return <span>{label}</span>
  }
  return { SelectField: Field, TextField: Field, TextareaField: Field }
})
vi.mock('@/shared/ui/form-dialog', () => ({
  FormDialog: ({ children, onSubmit }: { children: ReactNode; onSubmit: () => void }) => {
    mocks.submit = onSubmit
    return <div>{children}</div>
  },
}))
vi.mock('../application/client-actions', () => ({
  createClient: mocks.create,
  updateClient: mocks.update,
}))

import { ClientForm } from './client-form-dialog'

function render(
  variant: 'page' | 'dialog',
  client = null as React.ComponentProps<typeof ClientForm>['client'],
) {
  mocks.cursor = 0
  return renderToStaticMarkup(
    <ClientForm
      variant={variant}
      client={client ?? null}
      onClose={mocks.close}
      onSaved={mocks.saved}
    />,
  )
}

beforeEach(() => {
  mocks.states = []
  mocks.fields.clear()
  mocks.options.clear()
  mocks.submit = null
  mocks.blocker = null
  vi.clearAllMocks()
  mocks.create.mockReturnValue('new-client')
  mocks.types = [
    { id: '1', value: 'person', label: 'Particular', position: 1 },
    { id: '2', value: 'hotel', label: 'Hotel', position: 2 },
  ]
})

describe('client form', () => {
  it('uses the company options and saves the chosen type', () => {
    render('dialog')
    expect(mocks.options.get('Tipo de cliente')).toEqual([
      { value: 'person', label: 'Particular' },
      { value: 'hotel', label: 'Hotel' },
    ])
    mocks.fields.get('Nombre')?.('Marta')
    mocks.fields.get('Tipo de cliente')?.('hotel')
    render('dialog')
    mocks.submit?.()
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'hotel' }))
  })

  it('does not save if there are no available client types', () => {
    mocks.types = []
    render('dialog')
    mocks.fields.get('Nombre')?.('Marta')
    render('dialog')
    mocks.submit?.()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('creates a trimmed client and returns its id to the calling form', () => {
    render('dialog')
    mocks.fields.get('Nombre')?.('  Marta  ')
    mocks.fields.get('Email')?.('  marta@example.test  ')
    render('dialog')
    mocks.submit?.()
    mocks.submit?.()
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Marta', email: 'marta@example.test' }),
    )
    expect(mocks.saved).toHaveBeenCalledWith('new-client')
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('warns before leaving a changed page and lets the user keep editing', () => {
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('window', { confirm })
    const html = render('page')
    expect(html).toContain('Datos del cliente')
    expect(html).toContain('Contacto')
    expect(html).toContain('Direcciones y notas')
    expect(mocks.blocker?.enableBeforeUnload()).toBe(false)
    mocks.fields.get('Nombre')?.('Marta')
    render('page')
    expect(mocks.blocker?.enableBeforeUnload()).toBe(true)
    expect(mocks.blocker?.shouldBlockFn()).toBe(true)
    confirm.mockReturnValue(true)
    expect(mocks.blocker?.shouldBlockFn()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('updates the selected client instead of creating another one', () => {
    const client = {
      id: 'existing',
      tenantId: 'tenant',
      name: 'Original',
      taxId: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
    }
    render('dialog', client)
    mocks.fields.get('Nombre')?.('Actualizado')
    render('dialog', client)
    mocks.submit?.()
    expect(mocks.update).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({ name: 'Actualizado' }),
    )
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.saved).toHaveBeenCalledWith('existing')
  })
})
