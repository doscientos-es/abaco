import type * as React from 'react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServiceContract } from '../application/contract-actions'
import { ContractStatusPanel } from './contract-status-panel'

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  writable: true,
  changeReason: undefined as ((value: string) => void) | undefined,
  action: undefined as (() => void) | undefined,
  retry: undefined as (() => void) | undefined,
  disabled: false,
  transition: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  jobs: {
    data: [{ configured: true, work_team_id: null, frequency: 'weekly' }] as
      | { configured: boolean; work_team_id: string | null; frequency: 'weekly' | null }[]
      | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  teams: {
    data: [] as { id: string; archived: boolean }[],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
}))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
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
  useRef: (initial: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states)) mocks.states[index] = { current: initial }
    return mocks.states[index]
  },
}))
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    Card: Container,
    CardHeader: Container,
    CardTitle: Container,
    CardContent: Container,
    Badge: Container,
    Button: ({
      children,
      onPress,
      isDisabled,
    }: {
      children: ReactNode
      onPress: () => void
      isDisabled: boolean
    }) => {
      if (children === 'Reintentar comprobación') mocks.retry = onPress
      else {
        mocks.action = onPress
        mocks.disabled = isDisabled
      }
      return <button disabled={isDisabled}>{children}</button>
    },
    toast: { success: mocks.success, error: mocks.error },
  }
})
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === 'cleaning-services' ? mocks.jobs : mocks.teams,
}))
vi.mock('@/features/work-teams', () => ({ workTeamsQuery: () => ({ queryKey: ['work-teams'] }) }))
vi.mock('../application/cleaning-service-actions', () => ({ listCleaningServices: vi.fn() }))
vi.mock('@/features/auth', () => ({
  useSession: () => ({ role: 'editor' }),
  can: () => mocks.writable,
}))
vi.mock('@/shared/ui/form', () => ({
  TextField: ({
    label,
    value,
    onChange,
  }: {
    label: string
    value: string
    onChange: (value: string) => void
  }) => {
    mocks.changeReason = onChange
    return <input aria-label={label} value={value} readOnly />
  },
}))
vi.mock('../application/contract-actions', () => ({ transitionServiceContract: mocks.transition }))

const contract = {
  id: 'contract-1',
  tenant_id: 'tenant-1',
  status: 'active',
  starts_on: '2099-11-01',
  ends_on: '2100-10-31',
  timezone: 'Europe/Madrid',
  updated_at: 'version-1',
} as ServiceContract

function render(overrides: Partial<ServiceContract> = {}) {
  mocks.cursor = 0
  mocks.action = undefined
  mocks.retry = undefined
  mocks.changeReason = undefined
  return renderToStaticMarkup(<ContractStatusPanel contract={{ ...contract, ...overrides }} />)
}

describe('contract active/inactive control', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.states = []
    mocks.writable = true
    mocks.transition.mockResolvedValue(undefined)
    mocks.invalidate.mockResolvedValue(undefined)
    mocks.jobs = {
      data: [{ configured: true, work_team_id: null, frequency: 'weekly' }],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    }
    mocks.teams = { data: [], isPending: false, isError: false, refetch: vi.fn() }
  })

  it('requires a reason and explains cancellation of pending future visits', async () => {
    const html = render()
    expect(html).toContain('Activo')
    expect(html).toContain('se cancelarán las visitas futuras pendientes')
    expect(mocks.disabled).toBe(true)
    mocks.action?.()
    expect(mocks.transition).not.toHaveBeenCalled()
    mocks.changeReason?.('  Fin de temporada  ')
    render()
    expect(mocks.disabled).toBe(false)
    mocks.action?.()
    await vi.waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Contrato inactivo'))
    expect(mocks.transition).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      expectedUpdatedAt: 'version-1',
      nextStatus: 'paused',
      reason: 'Fin de temporada',
      operationId: expect.any(String),
    })
    for (const key of [
      'service-contract',
      'service-contracts',
      'contract-jobs',
      'office-visits',
      'contract-billing-periods',
    ]) {
      expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: [key, 'tenant-1'] })
    }
  })

  it.each(['draft', 'paused'] as const)('activates an inactive %s contract', async (status) => {
    const html = render({ status })
    expect(html).toContain('Inactivo')
    expect(html).toContain('Activar contrato')
    expect(mocks.changeReason).toBeUndefined()
    mocks.action?.()
    await vi.waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Contrato activo'))
    expect(mocks.transition).toHaveBeenCalledWith(
      expect.objectContaining({ nextStatus: 'active', reason: '' }),
    )
  })

  it('keeps failed changes retryable with the same operation identity', async () => {
    mocks.transition.mockRejectedValueOnce(new Error('Sin conexión'))
    render()
    mocks.changeReason?.('Fin de temporada')
    render()
    mocks.action?.()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalled())
    await vi.waitFor(() => {
      render()
      expect(mocks.disabled).toBe(false)
    })
    mocks.action?.()
    await vi.waitFor(() => expect(mocks.success).toHaveBeenCalled())
    expect(mocks.transition.mock.calls[0]?.[0]).toEqual(mocks.transition.mock.calls[1]?.[0])
  })

  it('blocks activation with invalid contract dates', () => {
    const html = render({ status: 'draft', ends_on: null })
    expect(html).toContain('Indica las fechas de inicio y fin del contrato.')
    expect(mocks.disabled).toBe(true)
    mocks.action?.()
    expect(mocks.transition).not.toHaveBeenCalled()
  })

  it('shows why activation is blocked until all jobs are configured', () => {
    mocks.jobs.data = []
    expect(render({ status: 'draft' })).toContain('Añade al menos un trabajo')
    expect(mocks.disabled).toBe(true)
    mocks.jobs.data = [{ configured: false, work_team_id: null, frequency: null }]
    expect(render({ status: 'draft' })).toContain('1 trabajo pendiente de configurar')
    expect(mocks.disabled).toBe(true)
    mocks.jobs.data = [{ configured: true, work_team_id: null, frequency: 'weekly' }]
    expect(render({ status: 'draft' })).toContain('Requisitos principales completos')
    expect(mocks.disabled).toBe(false)
  })

  it('blocks activation when the assigned team is archived or the contract has expired', () => {
    mocks.jobs.data = [{ configured: true, work_team_id: 'team', frequency: 'weekly' }]
    mocks.teams.data = [{ id: 'team', archived: true }]
    expect(render({ status: 'draft' })).toContain('equipos asignados que ya no están disponibles')
    expect(mocks.disabled).toBe(true)
    mocks.teams.data = [{ id: 'team', archived: false }]
    expect(render({ status: 'draft', starts_on: '2000-01-01', ends_on: '2000-12-31' })).toContain(
      'El contrato está vencido',
    )
    expect(mocks.disabled).toBe(true)
  })

  it('keeps activation disabled while jobs are loading', () => {
    mocks.jobs.data = undefined
    mocks.jobs.isPending = true
    expect(render({ status: 'draft' })).toContain('Comprobando trabajos')
    expect(mocks.disabled).toBe(true)
  })

  it('does not offer activation when the jobs cannot be checked', () => {
    mocks.jobs.data = undefined
    mocks.jobs.isError = true
    expect(render({ status: 'draft' })).toContain('No se pudieron comprobar los trabajos')
    expect(mocks.disabled).toBe(true)
    mocks.action?.()
    expect(mocks.transition).not.toHaveBeenCalled()
    mocks.retry?.()
    expect(mocks.jobs.refetch).toHaveBeenCalledOnce()
  })

  it('shows a server-side activation failure in the panel', async () => {
    mocks.transition.mockRejectedValueOnce(new Error('Centro no disponible para generar trabajos'))
    render({ status: 'draft' })
    mocks.action?.()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalled())
    expect(render({ status: 'draft' })).toContain('Centro no disponible para generar trabajos')
  })

  it('does not require available teams for legacy seasonal rules', () => {
    mocks.jobs.data = [{ configured: true, work_team_id: 'team', frequency: null }]
    mocks.teams.data = [{ id: 'team', archived: true }]
    expect(render({ status: 'paused' })).toContain('Requisitos principales completos')
    expect(mocks.disabled).toBe(false)
  })

  it('checks all teams when modern and legacy rules coexist', () => {
    mocks.jobs.data = [
      { configured: true, work_team_id: null, frequency: 'weekly' },
      { configured: true, work_team_id: 'team', frequency: null },
    ]
    mocks.teams.data = [{ id: 'team', archived: true }]
    expect(render({ status: 'paused' })).toContain('equipos asignados que ya no están disponibles')
    expect(mocks.disabled).toBe(true)
  })

  it('allows retrying an unsuccessful team check', () => {
    mocks.jobs.data = [{ configured: true, work_team_id: 'team', frequency: 'weekly' }]
    mocks.teams.isError = true
    expect(render({ status: 'draft' })).toContain('No se pudieron comprobar los equipos')
    expect(mocks.disabled).toBe(true)
    mocks.retry?.()
    expect(mocks.teams.refetch).toHaveBeenCalledOnce()
  })

  it('shows the status without offering changes to read-only users', () => {
    mocks.writable = false
    expect(render()).toContain('Activo')
    expect(mocks.action).toBeUndefined()
    expect(mocks.changeReason).toBeUndefined()
  })

  it.each(['expired', 'canceled'] as const)(
    'preserves a historical %s contract as inactive',
    (status) => {
      expect(render({ status })).toContain('Inactivo')
      expect(mocks.action).toBeUndefined()
    },
  )
})
