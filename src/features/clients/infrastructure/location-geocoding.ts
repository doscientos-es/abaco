export type LocationAddress = { address: string; city: string; postal_code: string }
export type LocationMatch = { label: string; coordinates: string }

export function locationAddressQuery({ address, city, postal_code }: LocationAddress): string {
  return [address, postal_code, city]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
}

export function googleMapsSearchUrl(query: string): string {
  const params = new URLSearchParams({ api: '1', query })
  return `https://www.google.com/maps/search/?${params}`
}

/** Photon is a free public demo service; requests are made only on explicit user action. */
export async function searchLocationAddress(query: string): Promise<LocationMatch[]> {
  const url = new URL('https://photon.komoot.io/api/')
  url.search = new URLSearchParams({ q: query, limit: '5' }).toString()
  const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('No se pudo buscar la dirección.')
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || !('features' in data) || !Array.isArray(data.features)) {
    throw new Error('La respuesta de búsqueda no es válida.')
  }
  return data.features.flatMap((feature: unknown): LocationMatch[] => {
    if (
      !feature ||
      typeof feature !== 'object' ||
      !('geometry' in feature) ||
      !('properties' in feature)
    )
      return []
    const geometry = feature.geometry as { coordinates?: unknown } | null
    const properties = feature.properties as Record<string, unknown> | null
    if (!geometry || !Array.isArray(geometry.coordinates) || !properties) return []
    const [longitude, latitude] = geometry.coordinates
    if (
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180
    )
      return []
    const text = (key: string) =>
      typeof properties[key] === 'string' ? properties[key].trim() : ''
    const street = [text('street'), text('housenumber')].filter(Boolean).join(' ')
    const parts = [
      text('name'),
      street,
      text('postcode'),
      text('city'),
      text('state'),
      text('country'),
    ].filter(Boolean)
    const label = [...new Set(parts)].join(', ')
    if (!label) return []
    const format = (value: number) => value.toFixed(7).replace(/\.?0+$/, '')
    return [{ label, coordinates: `${format(latitude)}, ${format(longitude)}` }]
  })
}
