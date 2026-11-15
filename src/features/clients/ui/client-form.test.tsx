import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServiceLocation } from '../domain/client-location'

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
  synchronize: vi.fn(),
  insertLocation: vi.fn(),
  updateLocation: vi.fn(),
  invalidate: vi.fn(),
  buttons: new Map<string, () => void>(),
  locations: [] as ServiceLocation[],
  passportStatus: 'success' as 'success' | 'pending' | 'error',
  refetch: vi.fn(),
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
  Button: ({
    children,
    onPress,
    isDisabled,
  }: {
    children: ReactNode
    onPress?: () => void
    isDisabled?: boolean
  }) => {
    if (typeof children === 'string' && onPress) mocks.buttons.set(children, onPress)
    return <button disabled={isDisabled}>{children}</button>
  },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/clientes">{children}</a>,
  useBlocker: (options: typeof mocks.blocker) => {
    mocks.blocker = options
  },
}))
vi.mock('@tanstack/react-query', () => ({
  queryOptions: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === 'client-types'
      ? { isSuccess: true, data: mocks.types }
      : {
          isSuccess: mocks.passportStatus === 'success',
          isPending: mocks.passportStatus === 'pending',
          isError: mocks.passportStatus === 'error',
          data:
            mocks.passportStatus === 'success'
              ? { locations: mocks.locations, contacts: [] }
              : undefined,
          refetch: mocks.refetch,
        },
}))
vi.mock('../infrastructure/client-location-repository', () => ({
  insertClientLocation: mocks.insertLocation,
  updateClientLocation: mocks.updateLocation,
}))
vi.mock('../application/client-types', () => ({
  clientTypesQuery: (id: string) => ({ queryKey: ['client-types', id] }),
}))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({ clients: [], tenant: { id: 'tenant' } }),
  synchronizeStoreSaves: mocks.synchronize,
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
const centre = {
  id: 'centre',
  name: 'Sede',
  kind: 'service' as const,
  address: 'Calle Uno',
  city: 'Melilla',
  postal_code: '52001',
  latitude: 35.2923,
  longitude: -2.9381,
  opening_hours: 'L–V 8–18',
  operational_contact: 'Recepción',
  access_notes: 'Puerta lateral',
  notes: '',
  active: true,
  updated_at: 'version-1',
}

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
  mocks.buttons.clear()
  mocks.locations = []
  mocks.passportStatus = 'success'
  vi.clearAllMocks()
  mocks.create.mockReturnValue('new-client')
  mocks.synchronize.mockReset().mockResolvedValue(undefined)
  mocks.invalidate.mockResolvedValue(undefined)
  mocks.insertLocation.mockReset().mockImplementation(async (_tenant, _client, id, input) => ({
    ...input,
    id,
    updated_at: 'created',
  }))
  mocks.updateLocation.mockReset().mockImplementation(async (_tenant, location, input) => ({
    ...input,
    id: location.id,
    updated_at: 'updated',
  }))
  mocks.types = [
    { id: '1', value: 'person', label: 'Particular', position: 1 },
    { id: '2', value: 'hotel', label: 'Hotel', position: 2 },
  ]
})

describe('client form', () => {
  it('uses the company options and saves the chosen type', async () => {
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
    await vi.waitFor(() => expect(mocks.saved).toHaveBeenCalled())
  })

  it('does not save if there are no available client types', () => {
    mocks.types = []
    render('dialog')
    mocks.fields.get('Nombre')?.('Marta')
    render('dialog')
    mocks.submit?.()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('creates a trimmed client and returns its id to the calling form', async () => {
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
    await vi.waitFor(() => expect(mocks.saved).toHaveBeenCalledWith('new-client'))
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

  it('updates the selected client instead of creating another one', async () => {
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
    await vi.waitFor(() => expect(mocks.saved).toHaveBeenCalledWith('existing'))
  })

  it('creates a centre with address and hours only after the client is persisted', async () => {
    let persisted!: () => void
    mocks.synchronize.mockReturnValue(
      new Promise<void>((resolve) => {
        persisted = resolve
      }),
    )
    render('dialog')
    mocks.fields.get('Nombre')?.('Nuevo cliente')
    mocks.buttons.get('Añadir centro')?.()
    render('dialog')
    expect(mocks.fields.has('Uso')).toBe(false)
    mocks.fields.get('Nombre del centro')?.('Oficina')
    render('dialog')
    mocks.fields.get('Dirección del centro')?.('Calle Nueva 2')
    render('dialog')
    mocks.fields.get('Horario del centro')?.('Lunes a viernes, 8–18')
    render('dialog')
    mocks.fields.get('Coordenadas del centro')?.('35.2923, -2.9381')
    render('dialog')
    mocks.submit?.()
    mocks.submit?.()
    expect(mocks.insertLocation).not.toHaveBeenCalled()
    expect(mocks.saved).not.toHaveBeenCalled()
    persisted()
    await vi.waitFor(() => expect(mocks.saved).toHaveBeenCalledWith('new-client'))
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.insertLocation).toHaveBeenCalledExactlyOnceWith(
      'tenant',
      'new-client',
      expect.any(String),
      expect.objectContaining({
        name: 'Oficina',
        kind: 'service',
        address: 'Calle Nueva 2',
        opening_hours: 'Lunes a viernes, 8–18',
        coordinates: '35.2923, -2.9381',
      }),
    )
  })

  it('loads and edits existing centres without losing other centre details', async () => {
    mocks.locations = [centre]
    expect(render('dialog', client)).toContain('Centros de trabajo')
    expect(mocks.fields.has('Uso')).toBe(true)
    mocks.fields.get('Dirección del centro')?.('Nueva ubicación')
    render('dialog', client)
    mocks.fields.get('Horario del centro')?.('Sábados 9–14')
    render('dialog', client)
    mocks.submit?.()
    await vi.waitFor(() => expect(mocks.saved).toHaveBeenCalledWith(client.id))
    expect(mocks.updateLocation).toHaveBeenCalledExactlyOnceWith(
      'tenant',
      centre,
      expect.objectContaining({
        address: 'Nueva ubicación',
        opening_hours: 'Sábados 9–14',
        postal_code: '52001',
        access_notes: 'Puerta lateral',
        coordinates: '35.2923, -2.9381',
      }),
    )
    expect(mocks.insertLocation).not.toHaveBeenCalled()
    expect(mocks.invalidate).toHaveBeenCalledWith({
      queryKey: ['client-passport', 'tenant', client.id],
    })
    expect(mocks.invalidate).toHaveBeenCalledWith({
      queryKey: ['work-target-options', 'tenant', client.id],
    })
  })

  it('does not write centres until submit and guards centre-only edits on the page', () => {
    mocks.locations = [centre]
    vi.stubGlobal('window', { confirm: () => false })
    render('page', client)
    expect(mocks.blocker?.enableBeforeUnload()).toBe(false)
    mocks.fields.get('Horario del centro')?.('Nuevo horario')
    render('page', client)
    expect(mocks.blocker?.shouldBlockFn()).toBe(true)
    expect(mocks.updateLocation).not.toHaveBeenCalled()
    expect(mocks.insertLocation).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('rejects incomplete centres and allows removing a new unsaved centre', async () => {
    render('dialog')
    mocks.fields.get('Nombre')?.('Cliente')
    mocks.buttons.get('Añadir centro')?.()
    render('dialog')
    mocks.submit?.()
    expect(mocks.create).not.toHaveBeenCalled()
    mocks.buttons.get('Quitar centro')?.()
    render('dialog')
    mocks.submit?.()
    await vi.waitFor(() => expect(mocks.saved).toHaveBeenCalled())
    expect(mocks.insertLocation).not.toHaveBeenCalled()
  })

  it.each(['pending', 'error'] as const)('blocks saving while centres are %s', (status) => {
    mocks.passportStatus = status
    const html = render('dialog', client)
    expect(html).toContain(
      status === 'pending' ? 'Cargando centros' : 'No se pudieron cargar los centros',
    )
    mocks.submit?.()
    expect(mocks.update).not.toHaveBeenCalled()
    if (status === 'error') {
      mocks.buttons.get('Reintentar')?.()
      expect(mocks.refetch).toHaveBeenCalledOnce()
    }
  })

  it('keeps edits and reuses the client and completed centres after a partial save', async () => {
    mocks.insertLocation
      .mockResolvedValueOnce({ ...centre, id: 'first', updated_at: 'created' })
      .mockRejectedValueOnce(new Error('Sin conexión'))
    render('dialog')
    mocks.fields.get('Nombre')?.('Nuevo')
    mocks.buttons.get('Añadir centro')?.()
    render('dialog')
    mocks.fields.get('Nombre del centro')?.('Primero')
    render('dialog')
    mocks.fields.get('Dirección del centro')?.('Dirección 1')
    render('dialog')
    mocks.buttons.get('Añadir centro')?.()
    render('dialog')
    mocks.fields.get('Nombre del centro')?.('Segundo')
    render('dialog')
    mocks.fields.get('Dirección del centro')?.('Dirección 2')
    render('dialog')
    // Return the same stable id passed to the repository for the first checkpoint.
    mocks.insertLocation
      .mockReset()
      .mockImplementationOnce(async (_tenant, _client, id, input) => ({
        ...input,
        id,
        updated_at: 'created',
      }))
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockImplementation(async (_tenant, _client, id, input) => ({
        ...input,
        id,
        updated_at: 'created',
      }))
    mocks.submit?.()
    await vi.waitFor(() => expect(mocks.insertLocation).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(render('dialog')).toContain('Sin conexión'))
    expect(mocks.saved).not.toHaveBeenCalled()
    mocks.submit?.()
    await vi.waitFor(() => expect(mocks.saved).toHaveBeenCalled())
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.insertLocation).toHaveBeenCalledTimes(3)
    expect(mocks.insertLocation.mock.calls[2]?.[2]).toBe(mocks.insertLocation.mock.calls[1]?.[2])
  })

  it('does not insert centres or close the form when persisting the client fails', async () => {
    mocks.synchronize.mockRejectedValueOnce(new Error('No se pudo guardar el cliente'))
    render('dialog')
    mocks.fields.get('Nombre')?.('Nuevo')
    render('dialog')
    mocks.submit?.()
    await vi.waitFor(() => expect(render('dialog')).toContain('No se pudo guardar el cliente'))
    expect(mocks.insertLocation).not.toHaveBeenCalled()
    expect(mocks.close).not.toHaveBeenCalled()
    mocks.submit?.()
    await vi.waitFor(() => expect(mocks.saved).toHaveBeenCalled())
    expect(mocks.create).toHaveBeenCalledOnce()
  })
})
