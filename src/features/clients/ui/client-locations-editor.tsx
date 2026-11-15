import { Button } from '@doscientos/ui'

import { locationInput, type LocationDraft } from '../domain/client-location'
import { LocationFields } from './location-fields'

export function ClientLocationsEditor({
  locations,
  onChange,
}: {
  locations: LocationDraft[]
  onChange: (locations: LocationDraft[]) => void
}) {
  return (
    <section
      className="border-border bg-card rounded-xl border p-4 sm:p-6"
      aria-labelledby="client-locations-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="client-locations-title" className="text-base font-semibold">
          Centros de trabajo
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onPress={() =>
            onChange([
              ...locations,
              { id: crypto.randomUUID(), original: null, input: locationInput() },
            ])
          }
        >
          Añadir centro
        </Button>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Gestiona las ubicaciones y horarios de este cliente. Se guardan al guardar el cliente.
      </p>
      {!locations.length ? (
        <p className="text-muted-foreground mt-4 text-sm">Este cliente todavía no tiene centros.</p>
      ) : null}
      <div className="mt-4 space-y-4">
        {locations.map((draft, index) => (
          <fieldset
            key={draft.id}
            className="border-border grid min-w-0 gap-4 rounded-lg border p-4 sm:grid-cols-2"
          >
            <legend className="px-1 text-sm font-medium">
              Centro {index + 1}
              {!draft.input.active ? ' · Inactivo' : ''}
            </legend>
            <LocationFields
              value={draft.input}
              showUsage={Boolean(draft.original)}
              onChange={(input) =>
                onChange(
                  locations.map((item) => (item.id === draft.id ? { ...item, input } : item)),
                )
              }
            />
            {!draft.original ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={() => onChange(locations.filter(({ id }) => id !== draft.id))}
              >
                Quitar centro
              </Button>
            ) : null}
          </fieldset>
        ))}
      </div>
    </section>
  )
}
