export const jobFrequencyLabels = {
  once: 'Una sola vez',
  weekly: 'Cada semana',
  fortnightly: 'Cada dos semanas (14 días)',
  days15: 'Cada 15 días',
  monthly: 'Cada mes, conservando el día de referencia',
} as const

export type ContractJobDraft = {
  title: string
  location_id: string | null
  modality: 'fixed' | 'mobile'
  service_type: 'ordinary' | 'windows' | 'garage' | 'other'
  frequency: keyof typeof jobFrequencyLabels | null
  anchor_on: string | null
  ends_on: string | null
  weekdays: number[]
  tasks: string
  weekly_tasks: Record<string, string>
  materials: string
  instructions: string
  requires_acceptance: boolean
  duration_minutes: number
  local_start: string
  assigned_user_id: string | null
  work_team_id: string | null
}

export function emptyContractJob(startsOn: string): ContractJobDraft {
  return {
    title: '', location_id: null, modality: 'mobile', service_type: 'other', frequency: 'once',
    anchor_on: startsOn, ends_on: null, weekdays: [], tasks: '', weekly_tasks: {}, materials: '',
    instructions: '', requires_acceptance: false, duration_minutes: 60, local_start: '',
    assigned_user_id: null, work_team_id: null,
  }
}

export function contractJobError(job: ContractJobDraft, startsOn: string, endsOn: string | null) {
  if (!job.title.trim() || job.title.trim().length > 200 || !job.tasks.trim())
    return 'Indica el nombre y qué hay que hacer.'
  if (!job.location_id) return 'Selecciona un centro.'
  if (!job.frequency || !(job.frequency in jobFrequencyLabels)) return 'Selecciona la frecuencia.'
  if (!job.anchor_on || job.anchor_on < startsOn || (endsOn && job.anchor_on > endsOn) ||
    (job.ends_on && (job.ends_on < job.anchor_on || (endsOn && job.ends_on > endsOn))))
    return 'Las fechas deben estar dentro de la vigencia del contrato.'
  if (job.frequency === 'once' && job.modality !== 'mobile')
    return 'Un trabajo puntual genera una orden, no una hoja permanente.'
  if ((job.frequency === 'weekly' || job.frequency === 'fortnightly') && !job.weekdays.length)
    return 'Selecciona al menos un día de la semana.'
  if (job.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
    return 'Los días de la semana no son válidos.'
  if (!Number.isInteger(job.duration_minutes) || job.duration_minutes < 15 || job.duration_minutes > 720)
    return 'La duración debe estar entre 15 y 720 minutos.'
  if (job.assigned_user_id && job.work_team_id) return 'Asigna una persona o un equipo, no ambos.'
  if (job.local_start && !/^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$/.test(job.local_start))
    return 'La hora prevista no es válida.'
  return null
}

export function normalizeContractJob(job: ContractJobDraft): ContractJobDraft {
  const weekly = job.frequency === 'weekly' || job.frequency === 'fortnightly'
  return {
    ...job, title: job.title.trim(), ends_on: job.frequency === 'once' ? null : job.ends_on,
    weekdays: weekly ? [...new Set(job.weekdays)].sort((a, b) => a - b) : [],
    weekly_tasks: weekly ? Object.fromEntries(Object.entries(job.weekly_tasks)
      .filter(([day]) => job.weekdays.includes(Number(day)))) : {},
  }
}