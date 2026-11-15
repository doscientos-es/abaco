import { openingScheduleError, type OpeningSchedule } from './location-opening-schedule'

export type ServiceLocation = {
  id: string
  name: string
  kind: 'service' | 'billing' | 'both'
  address: string
  city: string
  postal_code: string
  latitude: number | null
  longitude: number | null
  opening_hours: string
  opening_schedule?: OpeningSchedule | null
  operational_contact: string
  access_notes: string
  notes: string
  active: boolean
  updated_at: string
}

export type LocationInput = Omit<
  ServiceLocation,
  'id' | 'updated_at' | 'latitude' | 'longitude' | 'opening_schedule'
> & {
  coordinates: string
  opening_schedule: OpeningSchedule | null
}
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
    coordinates:
      location?.latitude != null || location?.longitude != null
        ? `${location.latitude ?? ''}, ${location.longitude ?? ''}`
        : '',
    opening_hours: location?.opening_hours ?? '',
    opening_schedule: location?.opening_schedule ?? null,
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
    coordinates: input.coordinates.trim(),
    opening_hours: input.opening_hours.trim(),
    operational_contact: input.operational_contact.trim(),
    access_notes: input.access_notes.trim(),
    notes: input.notes.trim(),
  }
}

export function parseLocationCoordinates(value: string): {
  latitude: number | null
  longitude: number | null
} | null {
  if (!value.trim()) return { latitude: null, longitude: null }
  const match = value.match(
    /^\s*([+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))\s*,\s*([+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))\s*$/,
  )
  if (!match) return null
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { latitude: Number(latitude.toFixed(7)), longitude: Number(longitude.toFixed(7)) }
}

export function locationPersistenceInput(input: LocationInput) {
  const { coordinates, ...rest } = cleanLocationInput(input)
  const parsed = parseLocationCoordinates(coordinates)
  if (!parsed) throw new Error('Introduce coordenadas válidas: latitud, longitud.')
  return { ...rest, ...parsed }
}

export function sameLocationInput(left: LocationInput, right: LocationInput): boolean {
  const clean = cleanLocationInput(right)
  const leftCoordinates = parseLocationCoordinates(left.coordinates)
  const rightCoordinates = parseLocationCoordinates(right.coordinates)
  return Object.entries(cleanLocationInput(left)).every(([key, value]) =>
    key === 'coordinates' && leftCoordinates && rightCoordinates
      ? leftCoordinates.latitude === rightCoordinates.latitude &&
        leftCoordinates.longitude === rightCoordinates.longitude
      : key === 'opening_schedule'
        ? JSON.stringify(value) === JSON.stringify(clean.opening_schedule)
        : value === clean[key as keyof LocationInput],
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
    openingScheduleError(clean.opening_schedule) === null &&
    clean.operational_contact.length <= 1000 &&
    clean.access_notes.length <= 2000 &&
    clean.notes.length <= 2000 &&
    parseLocationCoordinates(clean.coordinates) !== null &&
    locationKinds.some(({ value }) => value === clean.kind)
  )
}

export function changedLocation(draft: LocationDraft): boolean {
  return !draft.original || !sameLocationInput(draft.input, locationInput(draft.original))
}
