import { describe, expect, it } from 'vitest'

import {
  contractAssignmentError,
  initialContractAssignments,
  resolveContractAssignments,
  type ContractSignatureSetup,
} from './contract-task-assignment'

const setup: ContractSignatureSetup = {
  updated_at: 'v1',
  jobs: [{ id: 'j1', title: 'Limpieza', assigned_user_id: 'p1', work_team_id: null }],
  tasks: [
    {
      task_key: 'service:s1:r1',
      title: 'Ventanas',
      section_title: 'Servicios',
      frequency: 'Semanal',
      notes: '',
    },
  ],
  assignments: [],
  people: [
    { id: 'p1', label: 'Ana' },
    { id: 'p2', label: 'Pol' },
  ],
  teams: [{ id: 't1', name: 'Brigada' }],
}

describe('contract signature assignments', () => {
  it('defaults tasks to the sole job and inherits its person', () => {
    const drafts = initialContractAssignments(setup)
    expect(drafts[1]).toMatchObject({ job_id: 'j1', mode: 'inherit' })
    expect(resolveContractAssignments(drafts)[1]?.assigned_user_ids).toEqual(['p1'])
    expect(contractAssignmentError(setup, drafts)).toBeNull()
  })

  it('resolves inherited teams live when the job owner changes', () => {
    const drafts = initialContractAssignments(setup).map((draft) =>
      draft.task_key === 'job:j1'
        ? { ...draft, mode: 'team' as const, user_ids: [], team_id: 't1' }
        : draft,
    )
    expect(resolveContractAssignments(drafts)[1]).toMatchObject({
      assigned_user_ids: [],
      work_team_id: 't1',
    })
    expect(contractAssignmentError(setup, drafts)).toBeNull()
  })

  it('supports multiple people on a task independently from its job', () => {
    const drafts = initialContractAssignments(setup).map((draft) =>
      draft.task_key.startsWith('service:')
        ? { ...draft, mode: 'people' as const, user_ids: ['p2', 'p1', 'p2'] }
        : draft,
    )
    expect(resolveContractAssignments(drafts)[1]?.assigned_user_ids).toEqual(['p1', 'p2'])
    expect(contractAssignmentError(setup, drafts)).toBeNull()
  })

  it('restores multiple people configured on a job and inherits them for tasks', () => {
    const job = setup.jobs[0]
    if (!job) throw new Error('Expected job')
    const configured = {
      ...setup,
      jobs: [{ ...job, assigned_user_ids: ['p1', 'p2'] }],
    }
    const drafts = initialContractAssignments(configured)
    expect(drafts[0]?.user_ids).toEqual(['p1', 'p2'])
    expect(resolveContractAssignments(drafts)[1]?.assigned_user_ids).toEqual(['p1', 'p2'])
    expect(contractAssignmentError(configured, drafts)).toBeNull()
  })

  it('requires an explicit job choice when multiple jobs exist', () => {
    const multiple = {
      ...setup,
      jobs: [
        ...setup.jobs,
        { id: 'j2', title: 'Jardín', assigned_user_id: 'p2', work_team_id: null },
      ],
    }
    const drafts = initialContractAssignments(multiple)
    expect(drafts.at(-1)?.job_id).toBe('')
    expect(contractAssignmentError(multiple, drafts)).toContain('Asocia cada tarea')
  })

  it('restores persisted task ownership', () => {
    const saved = {
      ...setup,
      assignments: [
        { task_key: 'service:s1:r1', job_id: 'j1', assigned_user_ids: [], work_team_id: 't1' },
      ],
    }
    expect(initialContractAssignments(saved)[1]).toMatchObject({ mode: 'team', team_id: 't1' })
  })

  it('rejects missing and duplicate tasks', () => {
    const drafts = initialContractAssignments(setup)
    expect(contractAssignmentError(setup, drafts.slice(0, 1))).toContain('Revisa todas')
    const first = drafts[0]
    if (!first) throw new Error('Expected job')
    expect(contractAssignmentError(setup, [first, first])).toContain('Revisa todas')
  })

  it.each(['missing-person', 'missing-team', 'missing-owner', 'wrong-job'])(
    'rejects %s',
    (kind) => {
      const drafts = initialContractAssignments(setup)
      const job = drafts[0]
      if (!job) throw new Error('Expected job')
      if (kind === 'missing-person') job.user_ids = ['outsider']
      if (kind === 'missing-team') {
        job.mode = 'team'
        job.team_id = 'archived'
      }
      if (kind === 'missing-owner') job.user_ids = []
      if (kind === 'wrong-job') job.job_id = 'foreign'
      expect(contractAssignmentError(setup, drafts)).not.toBeNull()
    },
  )

  it('requires at least one job', () => {
    expect(contractAssignmentError({ ...setup, jobs: [], tasks: [] }, [])).toContain(
      'Añade al menos',
    )
  })
})
