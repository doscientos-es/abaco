import { Button } from '@doscientos/ui'

import {
  locationInput,
  setLocationClientDetails,
  type LocationDraft,
} from '../domain/client-location'
import { LocationFields } from './location-fields'

export function ClientLocationsEditor({
  locations,
  onChange,
  clientAddress,
  clientContact,
}: {
  locations: LocationDraft[]
  onChange: (locations: LocationDraft[]) => void
  clientAddress: string
  clientContact: string
}) {
  const updateLocation = (id: string, update: (draft: LocationDraft) => LocationDraft) =>
    onChange(locations.map((draft) => (draft.id === id ? update(draft) : draft)))

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
              {
                id: crypto.randomUUID(),
                original: null,
                input: {
                  ...locationInput(),
                  address: clientAddress,
                  operational_contact: clientContact,
                },
                usesClientDetails: true,
              },
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
              showClientDetails={Boolean(draft.original) || !draft.usesClientDetails}
              onChange={(input) => updateLocation(draft.id, (item) => ({ ...item, input }))}
            />
            {!draft.original ? (
              <div className="sm:col-span-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!draft.usesClientDetails}
                    onChange={(event) => {
                      const isDistinct = event.target.checked
                      updateLocation(draft.id, (item) =>
                        setLocationClientDetails(item, isDistinct, {
                          address: clientAddress,
                          operational_contact: clientContact,
                        }),
                      )
                    }}
                  />
                  <span>La dirección o el contacto de este centro son distintos</span>
                </label>
                {draft.usesClientDetails ? (
                  <p className="text-muted-foreground mt-1 text-sm">
                    Se usarán la dirección y el contacto del cliente.
                  </p>
                ) : null}
              </div>
            ) : null}
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
