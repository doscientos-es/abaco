import type { ServicePeriodicity } from '@/shared/domain/service-periodicity'

export type ContractTaskAssignment = {
  task_key: string
  job_id: string
  assigned_user_ids: string[]
  work_team_id: string | null
}

export type ContractAssignmentSetup = {
  updated_at: string
  jobs: Array<{
    id: string
    title: string
    assigned_user_id: string | null
    work_team_id: string | null
  }>
  tasks: Array<{
    task_key: string
    title: string
    section_title: string
    frequency: string
    notes: string
    periodicities?: ServicePeriodicity[]
  }>
  assignments: ContractTaskAssignment[]
}

export type ContractSignatureSetup = ContractAssignmentSetup & {
  people: Array<{ id: string; label: string }>
  teams: Array<{ id: string; name: string }>
}

export type ContractAssignmentDraft = {
  task_key: string
  job_id: string
  mode: 'people' | 'team' | 'inherit'
  user_ids: string[]
  team_id: string | null
}

export function initialContractAssignments(
  setup: ContractAssignmentSetup,
): ContractAssignmentDraft[] {
  const saved = new Map(setup.assignments.map((item) => [item.task_key, item]))
  return [
    ...setup.jobs.map((job): ContractTaskAssignment => ({
      task_key: `job:${job.id}`,
      job_id: job.id,
      assigned_user_ids: job.assigned_user_id ? [job.assigned_user_id] : [],
      work_team_id: job.work_team_id,
    })),
    ...setup.tasks.map((task): ContractTaskAssignment => ({
      task_key: task.task_key,
      job_id: setup.jobs.length === 1 ? (setup.jobs[0]?.id ?? '') : '',
      assigned_user_ids: [],
      work_team_id: null,
    })),
  ].map((initial) => {
    const item = saved.get(initial.task_key) ?? initial
    return {
      task_key: item.task_key,
      job_id: item.job_id,
      user_ids: item.assigned_user_ids,
      team_id: item.work_team_id,
      mode: item.work_team_id
        ? 'team'
        : item.assigned_user_ids.length || item.task_key.startsWith('job:')
          ? 'people'
          : 'inherit',
    }
  })
}

export function resolveContractAssignments(
  drafts: ContractAssignmentDraft[],
): ContractTaskAssignment[] {
  const byKey = new Map(drafts.map((draft) => [draft.task_key, draft]))
  return drafts.map((draft) => {
    const responsible = draft.mode === 'inherit' ? byKey.get(`job:${draft.job_id}`) : draft
    return {
      task_key: draft.task_key,
      job_id: draft.job_id,
      assigned_user_ids:
        responsible?.mode === 'people' ? [...new Set(responsible.user_ids)].sort() : [],
      work_team_id: responsible?.mode === 'team' ? responsible.team_id : null,
    }
  })
}

export function contractAssignmentError(
  setup: ContractSignatureSetup,
  drafts: ContractAssignmentDraft[],
): string | null {
  if (!setup.jobs.length) return 'Añade al menos un trabajo al contrato antes de firmar.'
  const expected = new Set([
    ...setup.jobs.map((job) => `job:${job.id}`),
    ...setup.tasks.map((task) => task.task_key),
  ])
  if (
    drafts.length !== expected.size ||
    new Set(drafts.map((draft) => draft.task_key)).size !== expected.size ||
    drafts.some((draft) => !expected.has(draft.task_key))
  )
    return 'Revisa todas las tareas y trabajos del contrato.'
  const jobs = new Set(setup.jobs.map((job) => job.id))
  const people = new Set(setup.people.map((person) => person.id))
  const teams = new Set(setup.teams.map((team) => team.id))
  for (const assignment of resolveContractAssignments(drafts)) {
    if (!jobs.has(assignment.job_id)) return 'Asocia cada tarea a un trabajo del contrato.'
    if (
      assignment.task_key.startsWith('job:') &&
      (assignment.task_key !== `job:${assignment.job_id}` ||
        assignment.assigned_user_ids.length > 1)
    )
      return 'Elige una persona o un equipo como responsable de cada trabajo.'
    if (
      assignment.work_team_id
        ? !teams.has(assignment.work_team_id) || assignment.assigned_user_ids.length > 0
        : !assignment.assigned_user_ids.length ||
          assignment.assigned_user_ids.length > 30 ||
          assignment.assigned_user_ids.some((id) => !people.has(id))
    )
      return 'Asigna personas o un equipo disponible a todos los trabajos y tareas.'
  }
  return null
}
