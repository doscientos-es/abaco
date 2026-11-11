import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as RelatedCreation from '@/features/clients/ui/related-record-creation'

import { CleaningServicesPanel } from './cleaning-services-panel'

type Field = { value: string; onChange: (value: string) => void; isDisabled?: boolean }
type Action = { onPress: () => void; disabled: boolean }
const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  fields: new Map<string, Field>(),
  actions: new Map<string, Action>(),
  dialog: null as null | { onSubmit: () => void; submitDisabled: boolean },
  jobDialog: null as null | { onSubmit: () => void; submitDisabled: boolean },
  locations: {} as Record<string, Array<{ id: string; name: string }>>,
  targetState: 'ready' as 'ready' | 'loading' | 'error',
  allowed: true,
  createLocation: vi.fn(),
  createContract: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
}))

// Keep hook state between server renders so tests can exercise the real page,
// related-record hook and location dialog without adding a DOM dependency.
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
      if (!(index in mocks.states)) {
        mocks.states[index] = typeof initial === 'function' ? initial() : initial
      }
      return [
        mocks.states[index],
        (value: unknown) => {
          mocks.states[index] = typeof value === 'function' ? value(mocks.states[index]) : value
        },
      ]
    },
  }
})
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    Button: ({
      children,
      onPress,
      isDisabled = false,
    }: {
      children: ReactNode
      onPress: () => void
      isDisabled?: boolean
    }) => {
      if (typeof children === 'string') {
        mocks.actions.set(children, { onPress, disabled: isDisabled })
      }
      return <button disabled={isDisabled}>{children}</button>
    },
    Card: Container,
    CardContent: Container,
    CardHeader: Container,
    CardTitle: Container,
    toast: { success: vi.fn(), error: mocks.error },
  }
})
vi.mock('@tanstack/react-query', () => ({
  queryOptions: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: ({ queryKey, enabled = true }: { queryKey: string[]; enabled?: boolean }) => {
    if (queryKey[0] === 'work-target-options') {
      const ready = enabled && mocks.targetState === 'ready'
      return {
        isSuccess: ready,
        isPending: !enabled || mocks.targetState === 'loading',
        isError: enabled && mocks.targetState === 'error',
        error: new Error('Sin conexión'),
        data: ready ? { locations: mocks.locations[queryKey[2] ?? ''] ?? [] } : undefined,
        refetch: mocks.refetch,
      }
    }
    return { data: queryKey[0] === 'service-contracts' ? { items: [], count: 0 } : [] }
  },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/contratos">{children}</a>,
  useNavigate: () => mocks.navigate,
}))
vi.mock('@/features/auth', () => ({
  useSession: () => ({ role: 'admin' }),
  can: () => mocks.allowed,
}))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({
    tenant: { id: 'tenant-1' },
    clients: [
      { id: 'client-1', name: 'Alborán' },
      { id: 'client-2', name: 'Otro cliente' },
    ],
  }),
  useSaveStatus: () => ({ state: 'saved' }),
  retryStoreSaves: vi.fn(),
}))
vi.mock('@/shared/ui/form', () => {
  const Field = ({ label, ...props }: Field & { label: string }) => {
    mocks.fields.set(label, props)
    return <span>{label}</span>
  }
  return { SelectField: Field, TextField: Field, TextareaField: Field }
})
vi.mock('@/shared/ui/form-dialog', () => ({
  FormDialog: (props: {
    open: boolean
    title: string
    children: ReactNode
    onSubmit: () => void
    submitDisabled: boolean
  }) => {
    if (!props.open) return null
    if (props.title.includes('trabajo')) mocks.jobDialog = props
    else mocks.dialog = props
    return <dialog open>{props.children}</dialog>
  },
}))
vi.mock('@/shared/ui/page-states', () => ({
  EmptyPanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/clients/ui/client-form-dialog', () => ({ ClientFormDialog: () => null }))
vi.mock('@/features/clients/ui/related-record-creation', async (importOriginal) => ({
  ...(await importOriginal<typeof RelatedCreation>()),
  RelatedCreateButton: ({
    label,
    onPress,
    disabled,
  }: {
    label: string
    onPress: () => void
    disabled: boolean
  }) => {
    mocks.actions.set(label, { onPress, disabled })
    return <button disabled={disabled}>{label}</button>
  },
}))
vi.mock('@/features/clients/application/client-passport-actions', () => ({
  createLocation: mocks.createLocation,
}))
vi.mock('@/features/visits/application/visit-actions', () => ({ listTechnicians: vi.fn() }))
vi.mock('@/features/work-orders/application/work-order-actions', () => ({
  loadWorkTargetOptions: vi.fn(),
}))
vi.mock('../application/contract-actions', () => ({
  createManualServiceContract: mocks.createContract,
  listServiceContracts: vi.fn(),
}))
vi.mock('../application/cleaning-service-actions', () => ({
  listCleaningServices: vi.fn(),
  saveContractJob: mocks.createContract,
}))

function render() {
  mocks.cursor = 0
  mocks.fields.clear()
  mocks.actions.clear()
  mocks.dialog = null
  mocks.jobDialog = null
  return renderToStaticMarkup(
    <CleaningServicesPanel
      tenantId="tenant-1"
      contractId="contract-1"
      clientId="client-1"
      clientName="Alborán"
      startsOn="2026-12-01"
      endsOn="2027-11-30"
      updatedAt="version-1"
      draft
      editable
    />,
  )
}
function press(label: string) {
  const action = mocks.actions.get(label)
  expect(action, label).toBeDefined()
  if (action && !action.disabled) action.onPress()
  return render()
}
function change(label: string, value: string) {
  const field = mocks.fields.get(label)
  expect(field, label).toBeDefined()
  field?.onChange(value)
  return render()
}
function openLocationForm() {
  render()
  press('Añadir trabajo')
  change('Nombre · obligatorio', 'Limpieza ordinaria')
  change('Tareas y alcance', 'Suelos y aseos')
  press('Crear centro')
  change('Nombre', 'Portal A')
  change('Dirección', 'Calle de prueba 1')
}
async function saveLocation() {
  expect(mocks.dialog?.submitDisabled).toBe(false)
  mocks.dialog?.onSubmit()
  await vi.waitFor(() => expect(mocks.createLocation).toHaveBeenCalledOnce())
  await vi.waitFor(() => {
    render()
    expect(mocks.dialog).toBeNull()
    expect(mocks.jobDialog?.submitDisabled).toBe(false)
  })
}

describe('contract job and inline centre creation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.states = []
    mocks.locations = {}
    mocks.targetState = 'ready'
    mocks.allowed = true
    mocks.invalidate.mockResolvedValue(undefined)
    mocks.createContract.mockResolvedValue('contract-1')
    mocks.createLocation.mockImplementation(async (input: { clientId: string; name: string }) => {
      mocks.locations[input.clientId] = [{ id: 'location-new', name: input.name }]
      return 'location-new'
    })
  })

  it('requires a centre and tasks, with no pool/asset selector', () => {
    render()
    const html = press('Añadir trabajo')
    expect(mocks.actions.get('Crear centro')?.disabled).toBe(false)
    expect(html).not.toContain('Piscina o activo')
    expect(mocks.jobDialog?.submitDisabled).toBe(true)
  })

  it('saves and selects a centre, then persists a punctual job for that contract', async () => {
    openLocationForm()
    await saveLocation()
    expect(mocks.createLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        clientId: 'client-1',
        name: 'Portal A',
        address: 'Calle de prueba 1',
        kind: 'service',
      }),
    )
    expect(mocks.fields.get('Centro · obligatorio')?.value).toBe('location-new')
    for (const key of ['work-target-options', 'client-passport']) {
      expect(mocks.invalidate).toHaveBeenCalledWith(
        { queryKey: [key, 'tenant-1', 'client-1'] },
        { throwOnError: true },
      )
    }
    mocks.jobDialog?.onSubmit()
    await vi.waitFor(() =>
      expect(mocks.createContract).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          contractId: 'contract-1',
          jobId: null,
          expectedUpdatedAt: 'version-1',
          service: expect.objectContaining({
            location_id: 'location-new',
            frequency: 'once',
            tasks: 'Suelos y aseos',
          }),
        }),
      ),
    )
  })

  it('keeps the entered centre data and the dialog open when saving fails', async () => {
    mocks.createLocation.mockRejectedValue(new Error('No se pudo guardar'))
    openLocationForm()
    mocks.dialog?.onSubmit()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalled())
    render()
    expect(mocks.dialog).not.toBeNull()
    expect(mocks.fields.get('Nombre')?.value).toBe('Portal A')
    expect(mocks.fields.get('Dirección')?.value).toBe('Calle de prueba 1')
    expect(mocks.jobDialog?.submitDisabled).toBe(true)
    expect(mocks.createContract).not.toHaveBeenCalled()
  })

  it('retries refreshing centres without inserting the saved centre again', async () => {
    mocks.invalidate.mockRejectedValueOnce(new Error('Sin conexión'))
    openLocationForm()
    mocks.dialog?.onSubmit()
    await vi.waitFor(() => expect(render()).toContain('No se pudieron actualizar los centros'))
    expect(mocks.jobDialog?.submitDisabled).toBe(true)
    press('Reintentar actualización')
    await vi.waitFor(() => {
      render()
      expect(mocks.jobDialog?.submitDisabled).toBe(false)
    })
    expect(mocks.createLocation).toHaveBeenCalledOnce()
  })

  it('keeps job data and reuses the operation id when retrying a failed save', async () => {
    openLocationForm()
    await saveLocation()
    mocks.createContract.mockRejectedValueOnce(new Error('Sin conexión'))
    mocks.jobDialog?.onSubmit()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalled())
    render()
    expect(mocks.fields.get('Nombre · obligatorio')?.value).toBe('Limpieza ordinaria')
    mocks.jobDialog?.onSubmit()
    await vi.waitFor(() => expect(mocks.createContract).toHaveBeenCalledTimes(2))
    expect(mocks.createContract.mock.calls[0]?.[0].operationId).toBe(
      mocks.createContract.mock.calls[1]?.[0].operationId,
    )
  })

  it('shows a retry action and blocks submission when centres cannot be loaded', () => {
    render()
    press('Añadir trabajo')
    mocks.targetState = 'error'
    expect(render()).toContain('No se pudieron cargar los centros')
    expect(mocks.jobDialog?.submitDisabled).toBe(true)
    press('Reintentar')
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('uses a new operation for a deliberate second job after a successful save', async () => {
    openLocationForm()
    await saveLocation()
    mocks.jobDialog?.onSubmit()
    await vi.waitFor(() => {
      render()
      expect(mocks.jobDialog).toBeNull()
    })
    press('Añadir trabajo')
    change('Nombre · obligatorio', 'Limpieza ordinaria')
    change('Centro · obligatorio', 'location-new')
    change('Tareas y alcance', 'Suelos y aseos')
    expect(mocks.jobDialog?.submitDisabled).toBe(false)
    mocks.jobDialog?.onSubmit()
    await vi.waitFor(() => expect(mocks.createContract).toHaveBeenCalledTimes(2))
    expect(mocks.createContract.mock.calls[0]?.[0].operationId).not.toBe(
      mocks.createContract.mock.calls[1]?.[0].operationId,
    )
  })

  it('does not offer centre creation without client write permission', () => {
    mocks.allowed = false
    render()
    press('Añadir trabajo')
    expect(mocks.actions.has('Crear centro')).toBe(false)
  })
})
