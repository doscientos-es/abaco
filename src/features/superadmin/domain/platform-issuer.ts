export const issuerFields = [
  'legal_name',
  'tax_id',
  'street',
  'postal_code',
  'city',
  'province',
  'series',
  'corrective_series',
] as const

export type IssuerProfile = Record<(typeof issuerFields)[number], string>
export type IssuerSettings = { revision: number; profile: IssuerProfile | null }

export const emptyIssuer = (): IssuerProfile =>
  Object.fromEntries(issuerFields.map((field) => [field, ''])) as IssuerProfile

export function normalizeIssuer(profile: IssuerProfile): IssuerProfile {
  const result = Object.fromEntries(
    issuerFields.map((field) => [field, profile[field].trim()]),
  ) as IssuerProfile
  result.tax_id = result.tax_id.toUpperCase()
  result.series = result.series.toUpperCase()
  result.corrective_series = result.corrective_series.toUpperCase()
  return result
}

export function issuerErrors(profile: IssuerProfile): Partial<Record<keyof IssuerProfile, string>> {
  const value = normalizeIssuer(profile)
  const errors: Partial<Record<keyof IssuerProfile, string>> = {}
  const lengths = { legal_name: 160, street: 250, city: 120, province: 120 } as const
  for (const [field, limit] of Object.entries(lengths)) {
    const key = field as keyof typeof lengths
    if (!value[key] || value[key].length > limit)
      errors[key] = `Obligatorio; máximo ${limit} caracteres.`
  }
  if (!/^[A-Z0-9]{9}$/.test(value.tax_id)) errors.tax_id = 'Introduce un NIF de 9 caracteres.'
  if (!/^[0-9]{5}$/.test(value.postal_code))
    errors.postal_code = 'Introduce un código postal de 5 cifras.'
  for (const key of ['series', 'corrective_series'] as const) {
    if (!/^[A-Z0-9_-]{1,20}$/.test(value[key]))
      errors[key] = 'Usa letras, cifras, guiones o guiones bajos (máximo 20).'
  }
  if (value.series && value.series === value.corrective_series)
    errors.corrective_series = 'Las dos series deben ser distintas.'
  return errors
}
