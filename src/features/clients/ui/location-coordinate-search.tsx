import { Button } from '@doscientos/ui'
import { useState } from 'react'

import {
  googleMapsSearchUrl,
  locationAddressQuery,
  searchLocationAddress,
  type LocationAddress,
  type LocationMatch,
} from '../application/location-geocoding'

export function LocationCoordinateSearch({
  address,
  onSelect,
}: {
  address: LocationAddress
  onSelect: (coordinates: string) => void
}) {
  const [search, setSearch] = useState<{
    query: string
    status: 'loading' | 'done' | 'error'
    results: LocationMatch[]
  } | null>(null)
  const query = locationAddressQuery(address)
  const current = search?.query === query ? search : null

  async function find() {
    if (!address.address.trim() || search?.status === 'loading') return
    setSearch({ query, status: 'loading', results: [] })
    try {
      const results = await searchLocationAddress(query)
      setSearch({ query, status: 'done', results })
    } catch {
      setSearch({ query, status: 'error', results: [] })
    }
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          isDisabled={!address.address.trim() || search?.status === 'loading'}
          onPress={() => void find()}
        >
          {search?.status === 'loading' ? 'Buscando…' : 'Buscar coordenadas'}
        </Button>
        {address.address.trim() ? (
          <a
            className="text-primary text-sm underline"
            href={googleMapsSearchUrl(query)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir dirección en Google Maps
          </a>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        Al buscar se envía la dirección a Photon. Datos de{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          OpenStreetMap
        </a>
        . Comprueba el resultado antes de seleccionarlo. En Google Maps, haz clic derecho en el
        punto (o mantenlo pulsado en el móvil) para copiar sus coordenadas.
      </p>
      {current?.status === 'error' ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudo buscar. Prueba Google Maps o introduce las coordenadas manualmente.
        </p>
      ) : null}
      {current?.status === 'done' && !current.results.length ? (
        <output className="text-muted-foreground text-sm">
          No encontramos coincidencias. Prueba Google Maps o introduce las coordenadas manualmente.
        </output>
      ) : null}
      {current?.status === 'done' && current.results.length ? (
        <fieldset className="space-y-1">
          <legend className="text-sm">Selecciona la dirección correcta:</legend>
          {current.results.map((result) => (
            <Button
              key={`${result.label}-${result.coordinates}`}
              type="button"
              variant="outline"
              className="h-auto w-full justify-start text-left whitespace-normal"
              onPress={() => {
                onSelect(result.coordinates)
                setSearch(null)
              }}
            >
              {result.label} <span className="text-muted-foreground">({result.coordinates})</span>
            </Button>
          ))}
        </fieldset>
      ) : null}
    </div>
  )
}
