import { z } from 'zod'

export const servicePeriodicityValues = [
  'daily',
  'twice_weekly',
  'weekly',
  'monthly',
  'semiannual',
  'annual',
] as const

export const servicePeriodicityLabels: Record<ServicePeriodicity, string> = {
  daily: 'Diario',
  twice_weekly: 'Dos veces a la semana',
  weekly: 'Semanal',
  monthly: 'Mensual',
  semiannual: 'Semestral',
  annual: 'Anual',
}

export type ServicePeriodicity = (typeof servicePeriodicityValues)[number]
export const servicePeriodicitiesSchema = z
  .array(z.enum(servicePeriodicityValues))
  .max(servicePeriodicityValues.length)
  .refine(
    (values) => new Set(values).size === values.length,
    'Las periodicidades no pueden repetirse.',
  )

type QuotedFrequency = { frequency: string; periodicities?: ServicePeriodicity[] | undefined }

const legacyAliases: Record<string, ServicePeriodicity> = {
  diario: 'daily',
  diaria: 'daily',
  'cada día': 'daily',
  'todos los días': 'daily',
  'dos veces a la semana': 'twice_weekly',
  'dos veces por semana': 'twice_weekly',
  semanal: 'weekly',
  'cada semana': 'weekly',
  mensual: 'monthly',
  'cada mes': 'monthly',
  semestral: 'semiannual',
  'dos veces al año': 'semiannual',
  'cada seis meses': 'semiannual',
  anual: 'annual',
  'una vez al año': 'annual',
  'cada año': 'annual',
}

/** Only exact known legacy labels are mapped. Arbitrary agreed text is never discarded. */
export function serviceFrequencySelection(row: QuotedFrequency): {
  periodicities: ServicePeriodicity[]
  other: string
} {
  if (row.periodicities !== undefined)
    return { periodicities: row.periodicities, other: row.frequency }
  const label = row.frequency.trim().toLocaleLowerCase('es')
  const known = Object.hasOwn(legacyAliases, label) ? legacyAliases[label] : undefined
  return known ? { periodicities: [known], other: '' } : { periodicities: [], other: row.frequency }
}

export function changeServicePeriodicity<T extends QuotedFrequency>(
  row: T,
  periodicity: ServicePeriodicity,
  checked: boolean,
): T & { periodicities: ServicePeriodicity[] } {
  const selected = serviceFrequencySelection(row)
  const periodicities = servicePeriodicityValues.filter((value) =>
    value === periodicity ? checked : selected.periodicities.includes(value),
  )
  return { ...row, frequency: selected.other, periodicities }
}
