import type { FormEvent, ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { ServiceContract } from '../application/contract-actions'

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  invalidate: vi.fn(),
  states: [] as unknown[],
  cursor: 0,
  fields: new Map<string, (value: string) => void>(),
  locations: [
    { id: 'centre', name: 'Centro' },
    { id: 'other', name: 'Otro centro' },
  ],
  targetState: 'ready' as 'ready' | 'error',
  refetch: vi.fn(),
  picker: null as null | {
    visiblePeople: { id: string; label: string }[]
    selected: { people: string[] }
  },
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: (value: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states)) mocks.states[index] = value
    return [
      mocks.states[index],
      (next: unknown) => {
        mocks.states[index] = next
      },
    ]
  },
  useRef: (value: unknown) => ({ current: value }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  queryOptions: (options: unknown) => options,
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    isSuccess: queryKey[0] !== 'work-target-options' || mocks.targetState === 'ready',
    isError: queryKey[0] === 'work-target-options' && mocks.targetState === 'error',
    data:
      queryKey[0] === 'work-target-options'
        ? { locations: mocks.locations }
        : queryKey[0] === 'staff-functions'
          ? [{ id: 'cleaning', name: 'Limpieza' }]
          : queryKey[0] === 'staff-schedules'
            ? [{ userId: 'ana', functionIds: ['cleaning'] }]
            : queryKey[0] === 'technicians'
              ? [
                  { id: 'ana', label: 'Ana' },
                  { id: 'bea', label: 'Bea' },
                ]
              : [],
    refetch: mocks.refetch,
  }),
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/shared/ui/form', () => ({
  SelectField: ({ label, onChange }: { label: string; onChange: (value: string) => void }) => {
    mocks.fields.set(label, onChange)
    return <span>{label}</span>
  },
  TextField: ({ label, onChange }: { label: string; onChange: (value: string) => void }) => {
    mocks.fields.set(label, onChange)
    return <span>{label}</span>
  },
  TextareaField: ({ label, onChange }: { label: string; onChange: (value: string) => void }) => {
    mocks.fields.set(label, onChange)
    return <span>{label}</span>
  },
}))
vi.mock('@/features/clients/ui/related-record-creation', () => ({
  RelatedCreateButton: () => <button>Crear centro</button>,
  useRelatedRecordCreation: () => ({ allowed: true, pending: false, status: null, dialogs: null }),
}))
vi.mock('../application/contract-actions', () => ({ updateContractGeneralDetails: mocks.save }))
vi.mock('./contract-responsible-picker', () => ({
  ContractResponsiblePicker: (props: typeof mocks.picker) => {
    mocks.picker = props
    return null
  },
}))

import { ContractAgreementForm } from './contract-agreement-form'

function submit(element: ReturnType<typeof ContractAgreementForm>) {
  element.props.children[0].props.onSubmit({
    preventDefault: vi.fn(),
  } as unknown as FormEvent<HTMLFormElement>)
}

describe('contract summary form', () => {
  it.each(['pending', 'manual', 'automatic'] as const)(
    'hides renewal and preserves the existing %s value when saving',
    async (renewal) => {
      mocks.save.mockClear()
      mocks.cursor = 0
      mocks.states = []
      mocks.save.mockResolvedValue(undefined)
      mocks.invalidate.mockResolvedValue(undefined)
      const contract = {
        id: 'contract',
        status: 'draft',
        tenant_id: 'tenant',
        client_id: 'client',
        location_id: 'centre',
        assigned_user_ids: ['person'],
        work_team_id: null,
        starts_on: '2026-01-01',
        ends_on: '2026-12-31',
        renewal_mode: renewal,
        notes: 'Notas',
      } as ServiceContract
      const form = ContractAgreementForm({ contract })
      const html = renderToStaticMarkup(form)
      expect(html).not.toContain('Renovación')
      expect(html).toContain('Fecha de inicio')
      submit(form)
      await vi.waitFor(() =>
        expect(mocks.save).toHaveBeenCalledWith(
          expect.objectContaining({
            contract,
            renewal,
            startsOn: '2026-01-01',
            endsOn: '2026-12-31',
            notes: 'Notas',
            locationId: 'centre',
            people: ['person'],
            team: null,
          }),
        ),
      )
    },
  )

  it('saves changed dates and notes and closes only on success', async () => {
    mocks.states = []
    mocks.cursor = 0
    mocks.save.mockClear()
    mocks.save.mockResolvedValue(undefined)
    const onSaved = vi.fn()
    const contract = {
      id: 'contract',
      status: 'draft',
      tenant_id: 'tenant',
      client_id: 'client',
      location_id: 'centre',
      assigned_user_ids: [],
      work_team_id: null,
      starts_on: '2026-01-01',
      ends_on: '2026-12-31',
      renewal_mode: 'manual',
      notes: 'Antes',
    } as unknown as ServiceContract
    renderToStaticMarkup(ContractAgreementForm({ contract, onSaved }))
    mocks.fields.get('Fecha de fin · obligatoria')?.('2027-01-31')
    mocks.fields.get('Notas (opcional)')?.('Después')
    mocks.fields.get('Centro · obligatorio')?.('other')
    mocks.cursor = 0
    const form = ContractAgreementForm({ contract, onSaved })
    submit(form)
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        endsOn: '2027-01-31',
        notes: 'Después',
        locationId: 'other',
        renewal: 'manual',
        contract,
      }),
    )
  })

  it('keeps the editor open when the save fails', async () => {
    mocks.states = []
    mocks.cursor = 0
    mocks.save.mockClear()
    mocks.save.mockRejectedValueOnce(new Error('Sin conexión'))
    const onSaved = vi.fn()
    const contract = {
      id: 'contract',
      status: 'draft',
      tenant_id: 'tenant',
      client_id: 'client',
      location_id: 'centre',
      assigned_user_ids: [],
      work_team_id: null,
      starts_on: '2026-01-01',
      ends_on: '2026-12-31',
      renewal_mode: 'manual',
      notes: '',
    } as unknown as ServiceContract
    const form = ContractAgreementForm({ contract, onSaved })
    submit(form)
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalled())
    await vi.waitFor(() => expect(mocks.states[6]).toBe(false))
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('does not save an unavailable centre or while the centre list fails to load', () => {
    mocks.states = []
    mocks.cursor = 0
    mocks.save.mockClear()
    const contract = {
      id: 'contract',
      status: 'draft',
      tenant_id: 'tenant',
      client_id: 'client',
      location_id: 'missing',
      assigned_user_ids: [],
      work_team_id: null,
      starts_on: '2026-01-01',
      ends_on: '2026-12-31',
      renewal_mode: 'manual',
      notes: '',
    } as unknown as ServiceContract
    mocks.targetState = 'ready'
    let form = ContractAgreementForm({ contract })
    expect(renderToStaticMarkup(form)).toContain('El centro seleccionado no está disponible')
    submit(form)
    expect(mocks.save).not.toHaveBeenCalled()
    mocks.cursor = 0
    mocks.targetState = 'error'
    form = ContractAgreementForm({ contract })
    expect(renderToStaticMarkup(form)).toContain('No se pudieron cargar los centros')
    submit(form)
    expect(mocks.save).not.toHaveBeenCalled()
    mocks.targetState = 'ready'
  })

  it('filters the worker options by function without removing selected workers', () => {
    mocks.states = []
    mocks.cursor = 0
    const contract = {
      id: 'contract',
      tenant_id: 'tenant',
      client_id: 'client',
      status: 'draft',
      location_id: 'centre',
      assigned_user_ids: ['bea'],
      work_team_id: null,
      starts_on: '2026-01-01',
      ends_on: '2026-12-31',
      renewal_mode: 'manual',
      notes: '',
    } as ServiceContract
    renderToStaticMarkup(ContractAgreementForm({ contract }))
    expect(mocks.picker?.visiblePeople).toHaveLength(2)
    mocks.fields.get('Función')?.('cleaning')
    mocks.cursor = 0
    renderToStaticMarkup(ContractAgreementForm({ contract }))
    expect(mocks.picker?.visiblePeople).toEqual([{ id: 'ana', label: 'Ana' }])
    expect(mocks.picker?.selected.people).toEqual(['bea'])
    mocks.fields.get('Función')?.('')
    mocks.cursor = 0
    renderToStaticMarkup(ContractAgreementForm({ contract }))
    expect(mocks.picker?.visiblePeople).toHaveLength(2)
    expect(mocks.picker?.selected.people).toEqual(['bea'])
  })

  it('preserves an existing team when saving unrelated contract changes', async () => {
    mocks.states = []
    mocks.cursor = 0
    mocks.save.mockClear()
    mocks.save.mockResolvedValue(undefined)
    const contract = {
      id: 'contract',
      tenant_id: 'tenant',
      client_id: 'client',
      status: 'draft',
      location_id: 'centre',
      assigned_user_ids: [],
      work_team_id: 'existing-team',
      starts_on: '2026-01-01',
      ends_on: '2026-12-31',
      renewal_mode: 'manual',
      notes: '',
    } as unknown as ServiceContract
    const form = ContractAgreementForm({ contract })
    submit(form)
    await vi.waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          people: [],
          team: 'existing-team',
        }),
      ),
    )
  })
})
