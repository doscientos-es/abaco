import { ArrowSquareOut, MapPin } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'

import { clientPassportQuery } from '@/features/clients/application/client-location-actions'
import type { ServiceLocation } from '@/features/clients/domain/client-location'

import type { ServiceContract } from '../application/contract-actions'

export function locationMapLinks(location: ServiceLocation) {
  const { latitude: lat, longitude: lon } = location
  const valid =
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  const address = [location.address, location.postal_code, location.city].filter(Boolean).join(', ')
  const query = valid ? `${lat},${lon}` : address
  const external = query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null
  if (!valid || Math.abs(lat) >= 85 || Math.abs(lon) >= 180) return { external, embed: null }
  const bbox = [
    Math.max(-180, lon - 0.006),
    Math.max(-85, lat - 0.004),
    Math.min(180, lon + 0.006),
    Math.min(85, lat + 0.004),
  ].join(',')
  return {
    external,
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`,
  }
}

export function ContractLocations({ contract }: { contract: ServiceContract }) {
  const passport = useQuery(clientPassportQuery(contract.tenant_id, contract.client_id))
  const selected = passport.data?.locations.find((location) => location.id === contract.location_id)
  const links = selected ? locationMapLinks(selected) : null
  const pending = passport.isPending
  const failed = passport.isError
  return (
    <section
      className="border-border bg-card overflow-hidden rounded-xl border"
      aria-label="Mapa del centro"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
            <MapPin className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold">Centro del contrato</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Ubicación compartida por todos los trabajos.
            </p>
          </div>
        </div>
        {pending ? <p className="text-muted-foreground mt-4 text-sm">Cargando centros…</p> : null}
        {!pending && failed ? (
          <p role="alert" className="text-destructive mt-4 text-sm">
            No se pudieron cargar los centros. Vuelve a intentarlo más tarde.
          </p>
        ) : null}
        {!pending && !failed && !contract.location_id ? (
          <p className="text-muted-foreground mt-4 text-sm">Todavía no hay centro asignado.</p>
        ) : null}
        {!pending && !failed && contract.location_id && !selected ? (
          <p role="alert" className="text-muted-foreground mt-4 text-sm">
            El centro asignado no está disponible.
          </p>
        ) : null}
        {!pending && !failed && selected ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">{selected.name}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {[selected.address, selected.postal_code, selected.city].filter(Boolean).join(', ') ||
                'Sin dirección'}
            </p>
          </div>
        ) : null}
      </div>
      {!pending && !failed && selected && links?.embed ? (
        <>
          <iframe
            title={`Mapa de ${selected.name}`}
            src={links.embed}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-44 w-full border-0"
          />
          <p className="text-muted-foreground px-5 pt-2 text-xs">
            Mapa ©{' '}
            <a
              className="underline"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenStreetMap
            </a>{' '}
            · la ubicación se comparte con el proveedor del mapa.
          </p>
        </>
      ) : null}
      {!pending && !failed && selected && !links?.embed ? (
        <p className="text-muted-foreground px-5 text-xs">
          Añade coordenadas válidas al centro para mostrar el mapa.
        </p>
      ) : null}
      {!pending && !failed && links?.external ? (
        <a
          href={links.external}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary inline-flex items-center gap-1 px-5 pt-3 pb-5 text-sm font-medium hover:underline"
        >
          Abrir en Google Maps <ArrowSquareOut className="size-4" aria-hidden="true" />
        </a>
      ) : null}
    </section>
  )
}
