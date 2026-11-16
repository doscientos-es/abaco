import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as RelatedCreation from '@/features/clients/ui/related-record-creation'

import type { CleaningService } from '../application/cleaning-service-actions'
import type { ServiceContract } from '../application/contract-actions'
import { emptyContractJob } from '../domain/contract-job'
import { CleaningServicesPanel } from './cleaning-services-panel'

type Field = { value: string; onChange: (value: string) => void; isDisabled?: boolean }
type Action = { onPress: () => void; disabled: boolean }
const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  fields: new Map<string, Field>(),
  actions: new Map<string, Action>(),
  dialog: null as null | {
    onSubmit: () => void
    onOpenChange: (open: boolean) => void
    submitDisabled: boolean
  },
  jobDialog: null as null | { onSubmit: () => void; submitDisabled: boolean },
  locations: {} as Record<string, Array<{ id: string; name: string }>>,
  services: [] as CleaningService[],
  scope: [] as ServiceContract['included_scope'],
  contractLocationId: 'centre' as string | null,
  workTeamId: null as string | null,
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
    return {
      data:
        queryKey[0] === 'service-contracts'
          ? { items: [], count: 0 }
          : queryKey[0] === 'cleaning-services'
            ? mocks.services
            : [],
    }
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
    onOpenChange: (open: boolean) => void
    submitDisabled: boolean
  }) => {
    if (!props.open) return null
    if (props.title.includes('trabajo')) mocks.jobDialog = props
    else mocks.dialog = props
    return (
      <dialog open aria-label={props.title}>
        {props.children}
      </dialog>
    )
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

function render({ draft = true, editable = true }: { draft?: boolean; editable?: boolean } = {}) {
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
      contractLocationId={mocks.contractLocationId}
      preferredStart="10:30"
      assignedUserIds={[]}
      workTeamId={mocks.workTeamId}
      quotedScope={mocks.scope}
      startsOn="2026-12-01"
      endsOn="2027-11-30"
      updatedAt="version-1"
      draft={draft}
      editable={editable}
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
function openJobForm() {
  render()
  press('Añadir trabajo')
  change('Nombre · obligatorio', 'Limpieza ordinaria')
  change('Tareas y alcance', 'Suelos y aseos')
}

describe('contract jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.states = []
    mocks.locations = { 'client-1': [{ id: 'centre', name: 'Centro' }] }
    mocks.contractLocationId = 'centre'
    mocks.workTeamId = null
    mocks.services = []
    mocks.scope = []
    mocks.targetState = 'ready'
    mocks.allowed = true
    mocks.invalidate.mockResolvedValue(undefined)
    mocks.createContract.mockResolvedValue('contract-1')
    mocks.createLocation.mockImplementation(async (input: { clientId: string; name: string }) => {
      mocks.locations[input.clientId] = [{ id: 'location-new', name: input.name }]
      return 'location-new'
    })
  })

  it('never asks for a centre in the job form', () => {
    render()
    const html = press('Añadir trabajo')
    expect(mocks.actions.has('Crear centro')).toBe(false)
    expect(mocks.fields.has('Centro · obligatorio')).toBe(false)
    expect(mocks.fields.has('Modalidad')).toBe(false)
    expect(mocks.fields.has('Tipo')).toBe(false)
    expect(html).not.toContain('Piscina o activo')
    expect(mocks.jobDialog?.submitDisabled).toBe(true)
  })

  it('does not ask for a job end date and saves the contract end instead', async () => {
    mocks.workTeamId = 'team'
    mocks.services = [
      {
        ...emptyContractJob('2026-12-01'),
        id: 'job-1',
        configured: true,
        title: 'Cristales',
        tasks: 'Limpiar',
        frequency: 'monthly',
        weekdays: [1],
        local_start: '09:00',
        time_known: true,
        ends_on: '2027-03-31',
      } as CleaningService,
    ]
    render()
    press('Editar trabajo')
    expect(mocks.fields.has('Fin del trabajo (por defecto, fin del contrato)')).toBe(false)
    expect(mocks.jobDialog?.submitDisabled).toBe(false)
    mocks.jobDialog?.onSubmit()
    await vi.waitFor(() =>
      expect(mocks.createContract).toHaveBeenCalledWith(
        expect.objectContaining({ service: expect.objectContaining({ ends_on: null }) }),
      ),
    )
  })

  it('shows job details and allows editing in a draft', () => {
    mocks.locations['client-1'] = [{ id: 'centre', name: 'Portal A' }]
    mocks.services = [
      {
        ...emptyContractJob('2026-12-01'),
        id: 'job-1',
        configured: true,
        source_line_id: null,
        time_known: false,
        title: 'Limpieza',
        tasks: 'Suelos y aseos',
        location_id: 'centre',
        location: {
          name: 'Portal A',
          address: 'Calle Uno',
          operational_contact: '',
          access_notes: '',
          notes: '',
        },
      },
    ]
    const html = render()
    expect(html).toContain('Trabajos contratados')
    expect(html).not.toContain('2. Trabajos contratados')
    expect(html).toContain('hidden print:block')
    const printedCentre = html.match(/class="mt-4 hidden print:block">(.*?)<\/div>/)?.[1]
    expect(printedCentre).toContain('Portal A')
    expect(printedCentre).toContain('Calle Uno')
    expect(html.replace(printedCentre ?? '', '')).not.toContain('Portal A')
    expect(html).toContain('Suelos y aseos')
    press('Editar trabajo')
    expect(mocks.fields.get('Nombre · obligatorio')?.value).toBe('Limpieza')
    expect(mocks.fields.has('Centro · obligatorio')).toBe(false)
    expect(mocks.fields.has('Modalidad')).toBe(false)
    expect(mocks.fields.has('Tipo')).toBe(false)
    expect(mocks.actions.has('Crear centro')).toBe(false)
  })

  it('shows the quoted frequency and flags an existing one-off schedule without changing it', () => {
    mocks.scope = [
      {
        description: 'Suelos',
        source_section_id: 'section',
        source_service_id: 'row',
        frequency: 'Diario; Mensual',
      },
    ]
    mocks.services = [
      {
        ...emptyContractJob('2026-12-01'),
        id: 'job-1',
        configured: true,
        source_line_id: null,
        source_section_id: 'section',
        source_service_id: 'row',
        time_known: false,
        title: 'Suelos',
        tasks: 'Suelos',
      },
    ]
    const html = render()
    expect(html).toContain('Frecuencia acordada:')
    expect(html).toContain('Diario; Mensual')
    expect(html).toContain('Una sola vez')
    expect(html).toContain('La planificación guardada es puntual')
    expect(mocks.createContract).not.toHaveBeenCalled()
  })

  it.each([
    ['Semanal', 'weekly'],
    ['Mensual', 'monthly'],
    ['Diario', 'weekly'],
    ['Dos veces a la semana', 'weekly'],
    ['Diario; Mensual', ''],
  ])('uses the agreed frequency %s when configuring a quoted job', (frequency, expected) => {
    mocks.scope = [
      { description: 'Suelos', source_section_id: 'section', source_service_id: 'row', frequency },
    ]
    mocks.services = [
      {
        ...emptyContractJob('2026-12-01'),
        id: 'job-1',
        configured: false,
        source_line_id: null,
        source_section_id: 'section',
        source_service_id: 'row',
        time_known: false,
        title: 'Suelos',
        tasks: 'Suelos',
      },
    ]
    render()
    const html = press('Configurar trabajo')
    expect(html).toContain(`Frecuencia acordada en el presupuesto:`)
    expect(mocks.fields.has('Modalidad')).toBe(false)
    expect(mocks.fields.has('Tipo')).toBe(false)
    expect(html).toContain(frequency)
    if (expected) expect(mocks.fields.has('Frecuencia de planificación')).toBe(false)
    else expect(mocks.fields.get('Frecuencia de planificación')?.value).toBe('')
    expect(mocks.fields.has('Día de la semana favorito · obligatorio')).toBe(
      frequency === 'Semanal' || frequency === 'Mensual',
    )
    expect(mocks.fields.has('Fecha prevista · obligatorio')).toBe(false)
    expect(mocks.jobDialog?.submitDisabled).toBe(true)
  })

  it('explains why an active configured job cannot be edited, but allows pending jobs', () => {
    const job = {
      ...emptyContractJob('2026-12-01'),
      id: 'job-1',
      configured: true,
      source_line_id: null,
      time_known: false,
      title: 'Limpieza',
      tasks: 'Suelos',
    }
    mocks.services = [job]
    const html = render({ draft: false })
    expect(html).toContain('No editable mientras el contrato esté activo.')
    expect(mocks.actions.has('Editar trabajo')).toBe(false)
    mocks.services = [{ ...job, configured: false }]
    render({ draft: false })
    expect(mocks.actions.has('Configurar trabajo')).toBe(true)
  })

  it('does not suggest adding work or show editing actions to read-only users', () => {
    const html = render({ editable: false })
    expect(html).not.toContain('Añade el primer trabajo')
    expect(mocks.actions.has('Añadir trabajo')).toBe(false)
  })

  it.each([false, true])(
    'preserves existing instructions when editing a job (configured: %s)',
    async (configured) => {
      mocks.locations['client-1'] = [{ id: 'centre', name: 'Centro' }]
      mocks.services = [
        {
          ...emptyContractJob('2026-12-01'),
          id: 'job-1',
          configured,
          source_line_id: null,
          time_known: false,
          title: 'Limpieza',
          tasks: 'Suelos',
          location_id: 'centre',
          service_type: 'windows',
          instructions: 'Notas acordadas',
        },
      ]
      render()
      press(configured ? 'Editar trabajo' : 'Configurar trabajo')
      expect(mocks.fields.has('Instrucciones de acceso y observaciones')).toBe(false)
      if (!configured) {
        change('Frecuencia de planificación', 'once')
      }
      expect(mocks.jobDialog?.submitDisabled).toBe(false)
      mocks.jobDialog?.onSubmit()
      await vi.waitFor(() =>
        expect(mocks.createContract).toHaveBeenCalledWith(
          expect.objectContaining({
            service: expect.objectContaining({
              instructions: 'Notas acordadas',
              service_type: 'windows',
            }),
          }),
        ),
      )
    },
  )

  it('saves a new job with the centre of its contract', async () => {
    openJobForm()
    expect(mocks.jobDialog?.submitDisabled).toBe(false)
    mocks.jobDialog?.onSubmit()
    await vi.waitFor(() =>
      expect(mocks.createContract).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          contractId: 'contract-1',
          jobId: null,
          expectedUpdatedAt: 'version-1',
          service: expect.objectContaining({
            location_id: 'centre',
            frequency: 'once',
            modality: 'mobile',
            service_type: 'other',
            tasks: 'Suelos y aseos',
          }),
        }),
      ),
    )
  })

  it('keeps the modality of an existing fixed job when editing it', async () => {
    mocks.services = [
      {
        ...emptyContractJob('2026-12-01'),
        id: 'job-1',
        configured: true,
        source_line_id: null,
        time_known: true,
        title: 'Limpieza',
        tasks: 'Suelos',
        location_id: 'centre',
        modality: 'fixed',
        frequency: 'monthly',
        weekdays: [1],
        local_start: '08:00',
      },
    ]
    render()
    press('Editar trabajo')
    expect(mocks.fields.has('Modalidad')).toBe(false)
    expect(mocks.jobDialog?.submitDisabled).toBe(false)
    mocks.jobDialog?.onSubmit()
    await vi.waitFor(() =>
      expect(mocks.createContract).toHaveBeenCalledWith(
        expect.objectContaining({ service: expect.objectContaining({ modality: 'fixed' }) }),
      ),
    )
  })

  it('saves the quoted monthly frequency and selected weekday', async () => {
    mocks.workTeamId = 'team'
    mocks.scope = [{ description: 'Cristales', source_service_id: 'row', frequency: 'Mensual' }]
    mocks.services = [
      {
        ...emptyContractJob('2026-12-01'),
        id: 'job-1',
        configured: false,
        source_line_id: null,
        source_service_id: 'row',
        time_known: false,
        title: 'Cristales',
        tasks: 'Limpiar',
      },
    ]
    render()
    press('Configurar trabajo')
    change('Día de la semana favorito · obligatorio', '1')
    expect(mocks.fields.has('Hora prevista · obligatorio')).toBe(false)
    expect(mocks.jobDialog?.submitDisabled).toBe(false)
    mocks.jobDialog?.onSubmit()
    await vi.waitFor(() =>
      expect(mocks.createContract).toHaveBeenCalledWith(
        expect.objectContaining({
          service: expect.objectContaining({
            frequency: 'monthly',
            weekdays: [1],
            anchor_on: '2026-12-01',
            local_start: '10:30',
          }),
        }),
      ),
    )
  })

  it('uses the contract centre when editing a job with an old centre', async () => {
    mocks.services = [
      {
        ...emptyContractJob('2026-12-01'),
        id: 'job-1',
        configured: true,
        source_line_id: null,
        time_known: false,
        title: 'Limpieza',
        tasks: 'Suelos',
        location_id: 'old-centre',
      },
    ]
    render()
    press('Editar trabajo')
    expect(mocks.fields.has('Centro · obligatorio')).toBe(false)
    expect(mocks.jobDialog?.submitDisabled).toBe(false)
    mocks.jobDialog?.onSubmit()
    await vi.waitFor(() =>
      expect(mocks.createContract).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-1',
          service: expect.objectContaining({ location_id: 'centre' }),
        }),
      ),
    )
  })

  it('keeps job data and reuses the operation id when retrying a failed save', async () => {
    openJobForm()
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
    openJobForm()
    mocks.jobDialog?.onSubmit()
    await vi.waitFor(() => {
      render()
      expect(mocks.jobDialog).toBeNull()
    })
    press('Añadir trabajo')
    change('Nombre · obligatorio', 'Limpieza ordinaria')
    change('Tareas y alcance', 'Suelos y aseos')
    expect(mocks.jobDialog?.submitDisabled).toBe(false)
    mocks.jobDialog?.onSubmit()
    await vi.waitFor(() => expect(mocks.createContract).toHaveBeenCalledTimes(2))
    expect(mocks.createContract.mock.calls[0]?.[0].operationId).not.toBe(
      mocks.createContract.mock.calls[1]?.[0].operationId,
    )
  })

  it('blocks saving when the contract has no centre', () => {
    mocks.contractLocationId = null
    openJobForm()
    expect(render()).not.toContain('Selecciona el centro en los datos del contrato.')
    expect(mocks.jobDialog?.submitDisabled).toBe(true)
    mocks.jobDialog?.onSubmit()
    expect(mocks.createContract).not.toHaveBeenCalled()
  })
})
