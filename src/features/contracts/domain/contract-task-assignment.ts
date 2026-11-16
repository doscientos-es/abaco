import type { ServicePeriodicity } from '@/shared/domain/service-periodicity'

export type ContractTaskSchedule = {
  frequency: 'once' | 'weekly' | 'fortnightly' | 'days15' | 'monthly' | 'semiannual' | 'annual'
  anchor_on: string
  weekdays: number[]
  start_minute: number
  duration_minutes: number
}

export type ContractTaskAssignment = {
  task_key: string
  job_id: string
  assigned_user_ids: string[]
  work_team_id: string | null
  schedule?: ContractTaskSchedule | null
}

export type ContractAssignmentSetup = {
  updated_at: string
  jobs: Array<{
    id: string
    title: string
    assigned_user_id: string | null
    assigned_user_ids?: string[]
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
  teams: Array<{ id: string; name: string; memberIds?: string[] }>
}

export type ContractAssignmentDraft = {
  task_key: string
  job_id: string
  mode: 'people' | 'team' | 'inherit'
  user_ids: string[]
  team_id: string | null
  schedule?: ContractTaskSchedule | null
}

export function initialContractAssignments(
  setup: ContractAssignmentSetup,
  startsOn?: string,
  preferredStart = '09:00',
): ContractAssignmentDraft[] {
  const saved = new Map(setup.assignments.map((item) => [item.task_key, item]))
  const [hour = 9, minute = 0] = preferredStart.split(':').map(Number)
  return [
    ...setup.jobs.map((job): ContractTaskAssignment => ({
      task_key: `job:${job.id}`,
      job_id: job.id,
      assigned_user_ids:
        job.assigned_user_ids ?? (job.assigned_user_id ? [job.assigned_user_id] : []),
      work_team_id: job.work_team_id,
    })),
    ...setup.tasks.map((task): ContractTaskAssignment => ({
      task_key: task.task_key,
      job_id: setup.jobs.length === 1 ? (setup.jobs[0]?.id ?? '') : '',
      assigned_user_ids: [],
      work_team_id: null,
    })),
  ].map((initial) => {
    const item = initial.task_key.startsWith('job:')
      ? initial
      : (saved.get(initial.task_key) ?? initial)
    return {
      task_key: item.task_key,
      job_id: item.job_id,
      user_ids: item.assigned_user_ids,
      team_id: item.work_team_id,
      schedule: item.schedule
        ? { ...item.schedule, start_minute: hour * 60 + minute }
        : startsOn && !item.task_key.startsWith('job:')
          ? {
              frequency: 'weekly',
              anchor_on: startsOn,
              weekdays: [((new Date(`${startsOn}T00:00:00Z`).getUTCDay() + 6) % 7) + 1],
              start_minute: hour * 60 + minute,
              duration_minutes: 60,
            }
          : null,
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
      ...(draft.schedule ? { schedule: draft.schedule } : {}),
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
    const schedule = assignment.schedule
    if (
      schedule &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.anchor_on) ||
        !Number.isInteger(schedule.start_minute) ||
        schedule.start_minute < 0 ||
        schedule.start_minute >= 1440 ||
        !Number.isInteger(schedule.duration_minutes) ||
        schedule.duration_minutes < 15 ||
        schedule.duration_minutes > 720 ||
        schedule.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
        (['weekly', 'fortnightly'].includes(schedule.frequency) && !schedule.weekdays.length))
    )
      return 'Revisa la fecha, los días, la hora y la duración de cada tarea.'
    if (
      assignment.task_key.startsWith('job:') &&
      assignment.task_key !== `job:${assignment.job_id}`
    )
      return 'Asocia cada trabajo a su propia asignación.'
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
