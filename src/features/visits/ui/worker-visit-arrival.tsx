import { Button } from '@doscientos/ui'
import { CopyIcon, SignpostIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import { VisitMapsAction } from '@/shared/ui/contact-actions'

type ArrivalPlace = {
  title: string
  locationName: string | null | undefined
  clientName: string | null | undefined
  address: string | null | undefined
}

export function WorkerVisitArrival({ title, locationName, clientName, address }: ArrivalPlace) {
  const place = locationName?.trim()
  const customer = clientName?.trim()
  const destination = address?.trim()
  const [copy, setCopy] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')

  async function copyAddress() {
    if (!destination) return
    setCopy('copying')
    try {
      await navigator.clipboard.writeText(destination)
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }

  return (
    <section
      aria-label="Ficha de llegada"
      className="border-border bg-muted/40 min-w-0 space-y-2 rounded-lg border p-3"
    >
      <div className="flex items-center gap-2">
        <SignpostIcon className="text-primary shrink-0" size={18} aria-hidden="true" />
        <h4 className="font-semibold">Ficha de llegada</h4>
      </div>
      {place ? (
        <p className="font-medium wrap-break-word">{place}</p>
      ) : (
        <p className="text-muted-foreground">No hay un centro indicado.</p>
      )}
      {customer && customer !== place ? (
        <p className="text-muted-foreground text-xs wrap-break-word">Cliente: {customer}</p>
      ) : null}
      {destination ? (
        <>
          <p className="wrap-break-word">{destination}</p>
          <div className="grid min-w-0 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <div className="min-w-0 [&_a]:min-h-11">
              <VisitMapsAction
                showAddress={false}
                address={destination}
                label={`Cómo llegar a ${title} en Google Maps`}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 sm:w-fit"
              isDisabled={copy === 'copying'}
              onPress={() => void copyAddress()}
            >
              <CopyIcon aria-hidden="true" /> Copiar dirección
            </Button>
          </div>
          {copy === 'failed' ? (
            <p role="alert" className="text-destructive text-xs">
              No se pudo copiar automáticamente. Mantén pulsada la dirección para copiarla.
            </p>
          ) : (
            <output aria-live="polite" className="text-muted-foreground block text-xs">
              {copy === 'copied' ? 'Dirección copiada.' : ''}
            </output>
          )}
          <p className="text-muted-foreground text-xs">
            La dirección puede estar incompleta. Comprueba la localidad y el destino en Google Maps.
          </p>
        </>
      ) : (
        <p className="text-muted-foreground">
          Sin dirección de visita. Confirma el lugar con tu equipo antes de salir.
        </p>
      )}
    </section>
  )
}
