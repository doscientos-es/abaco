export type ServiceLocation = {
  id: string
  name: string
  kind: 'service' | 'billing' | 'both'
  address: string
  city: string
  postal_code: string
  opening_hours: string
  operational_contact: string
  access_notes: string
  notes: string
  active: boolean
  updated_at: string
}

export type LocationInput = Omit<ServiceLocation, 'id' | 'updated_at'>
export type LocationDraft = {
  id: string
  original: ServiceLocation | null
  input: LocationInput
}

export const locationKinds = [
  { value: 'service', label: 'Servicio' },
  { value: 'billing', label: 'Facturación' },
  { value: 'both', label: 'Servicio y facturación' },
]

export function locationInput(location?: ServiceLocation): LocationInput {
  return {
    name: location?.name ?? '',
    kind: location?.kind ?? 'service',
    address: location?.address ?? '',
    city: location?.city ?? '',
    postal_code: location?.postal_code ?? '',
    opening_hours: location?.opening_hours ?? '',
    operational_contact: location?.operational_contact ?? '',
    access_notes: location?.access_notes ?? '',
    notes: location?.notes ?? '',
    active: location?.active ?? true,
  }
}

export function cleanLocationInput(input: LocationInput): LocationInput {
  return {
    ...input,
    name: input.name.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    postal_code: input.postal_code.trim(),
    opening_hours: input.opening_hours.trim(),
    operational_contact: input.operational_contact.trim(),
    access_notes: input.access_notes.trim(),
    notes: input.notes.trim(),
  }
}

export function sameLocationInput(left: LocationInput, right: LocationInput): boolean {
  const clean = cleanLocationInput(right)
  return Object.entries(cleanLocationInput(left)).every(
    ([key, value]) => value === clean[key as keyof LocationInput],
  )
}

export function validLocationInput(input: LocationInput): boolean {
  const clean = cleanLocationInput(input)
  return (
    clean.name.length > 0 &&
    clean.name.length <= 160 &&
    clean.address.length > 0 &&
    clean.address.length <= 500 &&
    clean.opening_hours.length <= 2000 &&
    clean.operational_contact.length <= 1000 &&
    clean.access_notes.length <= 2000 &&
    clean.notes.length <= 2000 &&
    locationKinds.some(({ value }) => value === clean.kind)
  )
}

export function changedLocation(draft: LocationDraft): boolean {
  return !draft.original || !sameLocationInput(draft.input, locationInput(draft.original))
}
