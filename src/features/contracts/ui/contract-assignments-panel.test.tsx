import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContractSignatureSetup } from '../domain/contract-task-assignment'
import { ContractAssignmentsPanel } from './contract-assignments-panel'

const mocks = vi.hoisted(() => ({
  data: undefined as ContractSignatureSetup | undefined,
  pending: false,
  error: false,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mocks.data,
    isPending: mocks.pending,
    isError: mocks.error,
    refetch: vi.fn(),
  }),
}))
vi.mock('../application/contract-signature-actions', () => ({
  loadContractSignatureSetup: vi.fn(),
}))

describe('signed contract assignments', () => {
  const render = () =>
    renderToStaticMarkup(<ContractAssignmentsPanel tenantId="tenant" contractId="contract" />)
  beforeEach(() => {
    mocks.data = undefined
    mocks.pending = false
    mocks.error = false
  })

  it('shows persisted job teams and individual task assignees', () => {
    mocks.data = {
      updated_at: 'v1',
      jobs: [{ id: 'j1', title: 'Limpieza general', assigned_user_id: null, work_team_id: 't1' }],
      tasks: [
        {
          task_key: 'service:s1:r1',
          title: 'Cristales',
          section_title: 'Servicios',
          frequency: '',
          notes: '',
        },
      ],
      people: [
        { id: 'p1', label: 'Ana' },
        { id: 'p2', label: 'Pol' },
      ],
      teams: [{ id: 't1', name: 'Brigada' }],
      assignments: [
        { task_key: 'job:j1', job_id: 'j1', assigned_user_ids: [], work_team_id: 't1' },
        {
          task_key: 'service:s1:r1',
          job_id: 'j1',
          assigned_user_ids: ['p1', 'p2'],
          work_team_id: null,
        },
      ],
    }
    const html = render()
    for (const text of ['Limpieza general', 'Cristales', 'Brigada', 'Ana, Pol'])
      expect(html).toContain(text)
    expect(html).toContain('aria-label="Asignaciones de trabajos y tareas"')
  })

  it('explains historical contracts rather than inventing assignments', () => {
    mocks.data = { updated_at: 'v1', jobs: [], tasks: [], people: [], teams: [], assignments: [] }
    expect(render()).toContain('antes de incorporar la asignación por tareas')
  })

  it('handles loading and failed reads', () => {
    mocks.pending = true
    expect(render()).toContain('Cargando asignaciones')
    mocks.pending = false
    mocks.error = true
    expect(render()).toContain('No se pudieron cargar las asignaciones')
  })
})
