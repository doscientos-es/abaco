export const companyProfileFields = [
  'name',
  'legal_name',
  'tax_id',
  'email',
  'phone',
  'address',
  'postal_code',
  'city',
  'website',
] as const

export type CompanyProfileValues = Record<(typeof companyProfileFields)[number], string>
export type CompanyProfile = CompanyProfileValues & { updated_at: string }

export function normalizedCompanyProfile(profile: CompanyProfileValues): CompanyProfileValues {
  return Object.fromEntries(
    companyProfileFields.map((field) => [field, profile[field].trim()]),
  ) as CompanyProfileValues
}

export function companyProfileErrors(
  profile: CompanyProfileValues,
): Partial<Record<keyof CompanyProfileValues, string>> {
  const values = normalizedCompanyProfile(profile)
  const errors: Partial<Record<keyof CompanyProfileValues, string>> = {}
  if (!values.name || values.name.length > 120)
    errors.name = 'Escribe un nombre de hasta 120 caracteres.'
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
    errors.email = 'Escribe un correo válido.'
  if (values.website && !/^https?:\/\/[^\s./]+(?:\.[^\s/]+)+(?:\/[^\s]*)?$/i.test(values.website))
    errors.website = 'Introduce una web válida con http:// o https://.'
  const limits: Partial<Record<keyof CompanyProfileValues, number>> = {
    legal_name: 160,
    tax_id: 32,
    email: 254,
    phone: 32,
    address: 300,
    postal_code: 20,
    city: 100,
    website: 2048,
  }
  for (const [field, limit] of Object.entries(limits)) {
    const key = field as keyof CompanyProfileValues
    if (values[key].length > limit) errors[key] = `Máximo ${limit} caracteres.`
  }
  return errors
}
