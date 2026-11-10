import { contractDatesError, weeklyScheduleError, type WeeklyTimeSlot } from './weekly-schedule'

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
  weekly_slots: WeeklyTimeSlot[]
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
    title: '',
    location_id: null,
    modality: 'mobile',
    service_type: 'other',
    frequency: 'once',
    anchor_on: startsOn,
    ends_on: null,
    weekdays: [],
    weekly_slots: [],
    tasks: '',
    weekly_tasks: {},
    materials: '',
    instructions: '',
    requires_acceptance: false,
    duration_minutes: 60,
    local_start: '',
    assigned_user_id: null,
    work_team_id: null,
  }
}

export function contractJobError(job: ContractJobDraft, startsOn: string, endsOn: string | null) {
  if (!job.title.trim() || job.title.trim().length > 200 || !job.tasks.trim())
    return 'Indica el nombre y qué hay que hacer.'
  if (!job.location_id) return 'Selecciona un centro.'
  if (!job.frequency || !(job.frequency in jobFrequencyLabels)) return 'Selecciona la frecuencia.'
  if (endsOn && contractDatesError(startsOn, endsOn)) return contractDatesError(startsOn, endsOn)
  if (job.frequency !== 'once' && !endsOn)
    return 'Guarda primero la fecha de fin obligatoria del contrato.'
  if (
    !job.anchor_on ||
    job.anchor_on < startsOn ||
    (endsOn && job.anchor_on > endsOn) ||
    (job.frequency !== 'once' &&
      job.ends_on &&
      (job.ends_on < job.anchor_on || (endsOn && job.ends_on > endsOn)))
  )
    return 'Las fechas deben estar dentro de la vigencia del contrato.'
  if (job.frequency === 'once' && job.modality !== 'mobile')
    return 'Un trabajo puntual genera una orden, no una hoja permanente.'
  if (job.frequency === 'weekly' || job.frequency === 'fortnightly') {
    const error = weeklyScheduleError(job.weekly_slots)
    if (error) return error
  }
  if (job.frequency !== 'once' && job.modality === 'mobile' && !job.work_team_id)
    return 'Selecciona el equipo que realizará los trabajos.'
  if (
    job.frequency !== 'once' &&
    job.frequency !== 'weekly' &&
    job.frequency !== 'fortnightly' &&
    !job.local_start
  )
    return 'Marca la franja horaria de referencia en el calendario.'
  if (job.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
    return 'Los días de la semana no son válidos.'
  if (
    !Number.isInteger(job.duration_minutes) ||
    job.duration_minutes < 15 ||
    job.duration_minutes > 720
  )
    return 'La duración debe estar entre 15 y 720 minutos.'
  if (job.assigned_user_id && job.work_team_id) return 'Asigna una persona o un equipo, no ambos.'
  if (job.local_start && !/^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$/.test(job.local_start))
    return 'La hora prevista no es válida.'
  return null
}

export function normalizeContractJob(job: ContractJobDraft): ContractJobDraft {
  const weekly = job.frequency === 'weekly' || job.frequency === 'fortnightly'
  const weekdays = weekly
    ? [...new Set(job.weekly_slots.map((slot) => slot.weekday))].sort((a, b) => a - b)
    : []
  const first = job.weekly_slots[0]
  return {
    ...job,
    title: job.title.trim(),
    ends_on: job.frequency === 'once' ? null : job.ends_on,
    weekdays,
    weekly_slots: weekly
      ? [...job.weekly_slots].sort(
          (a, b) => a.weekday - b.weekday || a.start_minute - b.start_minute,
        )
      : [],
    ...(weekly && first
      ? {
          local_start: `${String(Math.floor(first.start_minute / 60)).padStart(2, '0')}:${String(first.start_minute % 60).padStart(2, '0')}`,
          duration_minutes: first.duration_minutes,
        }
      : {}),
    weekly_tasks: weekly
      ? Object.fromEntries(
          Object.entries(job.weekly_tasks).filter(([day]) => weekdays.includes(Number(day))),
        )
      : {},
  }
}
